use std::cmp::Ordering;

use crate::agent::{AgentId, agent_ids};
use crate::agents::probes::ModelProbeRegistry;
use crate::agents::types::{
    ModelCatalog, ModelOption, ProbeDisplay, ProbeDisplayStatus, ProbeResult,
};
use crate::config::Config;
use crate::host::FileSystem;
use crate::model::parse_model_ref;
use crate::router::types::RouteCandidate;
use crate::scanner::types::DetectedCli;

fn detected_for(detected: &[DetectedCli], agent: AgentId) -> Option<&DetectedCli> {
    detected.iter().find(|item| item.id == agent)
}

fn canonical_agent_index(agent: AgentId) -> usize {
    agent_ids()
        .position(|candidate| candidate == agent)
        .unwrap_or(usize::MAX)
}

fn config_order(config: &Config, agent: AgentId, model_id: &str) -> Option<usize> {
    config
        .agents
        .get(&agent)?
        .models
        .iter()
        .position(|model| model.id == model_id)
}

/// Probe every enabled, installed agent and merge native model facts with
/// CodeRelay metadata overrides.
pub fn probe_model_catalog(
    detected: &[DetectedCli],
    config: &Config,
    probes: &ModelProbeRegistry,
    fs: &dyn FileSystem,
) -> ModelCatalog {
    let default_reference = config
        .default_model
        .as_deref()
        .and_then(|value| parse_model_ref(value, config.default_agent).ok());

    let mut displays = Vec::new();
    for agent in agent_ids() {
        let agent_config = config.agents.get(&agent);
        if agent_config.is_some_and(|agent| !agent.enabled) {
            displays.push(ProbeDisplay {
                cli_id: agent,
                status: ProbeDisplayStatus::Disabled,
                models: Vec::new(),
                reason: Some("已在配置中禁用".to_owned()),
            });
            continue;
        }

        if !detected_for(detected, agent).is_some_and(|cli| cli.available) {
            displays.push(ProbeDisplay {
                cli_id: agent,
                status: ProbeDisplayStatus::NotInstalled,
                models: Vec::new(),
                reason: Some("未安装".to_owned()),
            });
            continue;
        }

        let Some(probe) = probes.get(&agent) else {
            displays.push(ProbeDisplay {
                cli_id: agent,
                status: ProbeDisplayStatus::Unprobed,
                models: Vec::new(),
                reason: Some("该 CLI 暂不支持模型探测，禁止执行".to_owned()),
            });
            continue;
        };

        match probe.probe(fs) {
            ProbeResult::Fail { reason } => {
                displays.push(ProbeDisplay {
                    cli_id: agent,
                    status: ProbeDisplayStatus::Unprobed,
                    models: Vec::new(),
                    reason: Some(reason),
                });
            }
            ProbeResult::Ok {
                models: probed,
                capabilities,
            } => {
                let models = probed
                    .into_iter()
                    .map(|model| {
                        let override_config = agent_config.and_then(|agent_config| {
                            agent_config
                                .models
                                .iter()
                                .find(|configured| configured.id == model.id)
                        });
                        let is_top_default = default_reference.as_ref().is_some_and(|reference| {
                            reference.agent == Some(agent) && reference.model == model.id
                        });

                        let model_id = model.id;
                        ModelOption {
                            cli_id: agent,
                            model_id: model_id.clone(),
                            label: override_config
                                .and_then(|configured| configured.label.clone())
                                .or(model.label)
                                .unwrap_or_else(|| {
                                    if model_id.is_empty() {
                                        agent.to_string()
                                    } else {
                                        model_id
                                    }
                                }),
                            description: override_config
                                .and_then(|configured| configured.description.clone())
                                .or(model.description),
                            is_default: is_top_default
                                || override_config.and_then(|configured| configured.default)
                                    == Some(true),
                            is_native_default: model.is_default,
                            capabilities: capabilities.clone(),
                            strengths: override_config
                                .map(|configured| configured.strengths.clone())
                                .unwrap_or_default(),
                            cost: override_config.and_then(|configured| configured.cost),
                            context_window: override_config
                                .and_then(|configured| configured.context_window),
                            available: true,
                            reason: None,
                        }
                    })
                    .collect();
                displays.push(ProbeDisplay {
                    cli_id: agent,
                    status: ProbeDisplayStatus::Found,
                    models,
                    reason: None,
                });
            }
        }
    }

    let mut options: Vec<ModelOption> = displays
        .iter()
        .flat_map(|display| display.models.iter().cloned())
        .collect();
    options.sort_by(|left, right| {
        let left_order = config_order(config, left.cli_id, &left.model_id);
        let right_order = config_order(config, right.cli_id, &right.model_id);
        left_order
            .unwrap_or(usize::MAX)
            .cmp(&right_order.unwrap_or(usize::MAX))
            .then_with(|| {
                canonical_agent_index(left.cli_id).cmp(&canonical_agent_index(right.cli_id))
            })
            .then_with(|| left.model_id.cmp(&right.model_id))
    });

    ModelCatalog {
        probes: displays,
        options,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetSelection {
    pub cli_id: AgentId,
    pub model_id: Option<String>,
}

fn known_agent_prefix(model: &str) -> Option<AgentId> {
    model.split_once(':')?.0.parse().ok()
}

/// Validate an explicit `--agent` / `--model` selection against the probe result.
pub fn validate_explicit_target(
    catalog: &ModelCatalog,
    agent: Option<&str>,
    model: Option<&str>,
    default_agent: AgentId,
) -> Result<TargetSelection, String> {
    let explicit_agent = match agent {
        Some(value) => Some(
            value
                .parse::<AgentId>()
                .map_err(|_| format!("不支持的 agent：{value}"))?,
        ),
        None => None,
    };

    let (reference_agent, model_id) = match model {
        Some(model) => {
            let prefixed_agent = known_agent_prefix(model);
            if let Some(explicit_agent) = explicit_agent
                && prefixed_agent.is_none()
            {
                (explicit_agent, model.trim().to_owned())
            } else {
                let reference = parse_model_ref(model, explicit_agent.unwrap_or(default_agent))
                    .map_err(|error| error.to_string())?;
                (
                    reference
                        .agent
                        .unwrap_or(explicit_agent.unwrap_or(default_agent)),
                    reference.model,
                )
            }
        }
        None => match explicit_agent {
            Some(agent) => (agent, String::new()),
            None => {
                return Err(
                    "显式选择缺少 agent：请传入 --agent 或 agent:model 形式的 --model".to_owned(),
                );
            }
        },
    };

    if let Some(agent) = explicit_agent
        && agent != reference_agent
    {
        return Err(format!(
            "--model 指向 {reference_agent}，但 --agent 是 {agent}"
        ));
    }

    let probe = catalog
        .probes
        .iter()
        .find(|item| item.cli_id == reference_agent)
        .ok_or_else(|| format!("不支持的 agent：{reference_agent}"))?;

    match probe.status {
        ProbeDisplayStatus::Disabled => {
            return Err(format!("agent 已禁用：{reference_agent}"));
        }
        ProbeDisplayStatus::NotInstalled => {
            return Err(format!("agent 未安装：{reference_agent}；请先安装对应 CLI"));
        }
        ProbeDisplayStatus::Found => {}
        ProbeDisplayStatus::Scanning | ProbeDisplayStatus::Unprobed => {
            return Err(format!(
                "agent 无法探测模型，禁止执行：{reference_agent}{}",
                probe
                    .reason
                    .as_deref()
                    .map(|reason| format!("（{reason}）"))
                    .unwrap_or_default()
            ));
        }
    }

    let model_id = (!model_id.is_empty()).then_some(model_id);
    if let Some(model_id) = &model_id
        && !probe
            .models
            .iter()
            .any(|option| option.model_id == *model_id)
    {
        let known = probe
            .models
            .iter()
            .map(|option| option.model_id.as_str())
            .collect::<Vec<_>>()
            .join("、");
        return Err(format!(
            "模型不存在于 {reference_agent} 的本机配置：{model_id}；已探测到：{}",
            if known.is_empty() {
                "（空）"
            } else {
                &known
            }
        ));
    }

    Ok(TargetSelection {
        cli_id: reference_agent,
        model_id,
    })
}

pub fn to_route_candidates(catalog: &ModelCatalog, config: &Config) -> Vec<RouteCandidate> {
    let default_reference = config
        .default_model
        .as_deref()
        .and_then(|value| parse_model_ref(value, config.default_agent).ok());

    catalog
        .options
        .iter()
        .filter(|option| option.available)
        .map(|option| {
            let is_top_default = default_reference.as_ref().is_some_and(|reference| {
                reference.agent == Some(option.cli_id) && reference.model == option.model_id
            });
            RouteCandidate {
                agent: option.cli_id,
                model: (!option.model_id.is_empty()).then(|| option.model_id.clone()),
                label: Some(option.label.clone()),
                strengths: option.strengths.clone(),
                cost: option.cost,
                context_window: option.context_window,
                is_default: is_top_default || option.is_default,
            }
        })
        .collect()
}

pub fn compare_targets(left: &TargetSelection, right: &TargetSelection) -> Ordering {
    canonical_agent_index(left.cli_id)
        .cmp(&canonical_agent_index(right.cli_id))
        .then_with(|| left.model_id.cmp(&right.model_id))
}
