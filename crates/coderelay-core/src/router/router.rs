use std::collections::HashSet;

use crate::agent::{AgentId, agent_ids};
use crate::config::{Config, RouteRule};
use crate::model::{ModelConfig, ModelStrength, parse_model_ref};
use crate::router::rules::{match_rules, rule_matches_candidate};
use crate::router::scorer::{compare_scores, score_candidates};
use crate::router::types::{
    RouteCandidate, RouteDecision, RouteError, RouteOptions, RouteRequest, RouteStrategy,
    RoutingMode, RoutingStrategy, ScoredCandidate,
};

fn candidate_for_model(
    config: &Config,
    agent: AgentId,
    model: Option<&ModelConfig>,
    default_model_agent: AgentId,
    default_model_id: &str,
) -> RouteCandidate {
    let model_id = model.map(|model| model.id.as_str());
    let is_top_level_default = agent == config.default_agent
        && default_model_agent == agent
        && (model_id.is_none() || default_model_id == model_id.unwrap_or_default());
    let strengths = model
        .map(|model| model.strengths.clone())
        .unwrap_or_default();

    RouteCandidate {
        agent,
        model: model_id.map(str::to_owned),
        label: model.and_then(|model| model.label.clone()),
        strengths,
        cost: model.and_then(|model| model.cost),
        context_window: model.and_then(|model| model.context_window),
        is_default: is_top_level_default
            || (agent == config.default_agent
                && model.and_then(|model| model.default) == Some(true)),
    }
}

fn dedupe_candidates(candidates: Vec<RouteCandidate>) -> Vec<RouteCandidate> {
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|candidate| {
            let key = match &candidate.model {
                Some(model) => format!("{}:{model}", candidate.agent),
                None => candidate.agent.to_string(),
            };
            seen.insert(key)
        })
        .collect()
}

fn candidate_agent_order(config: &Config, available_agents: Option<&[AgentId]>) -> Vec<AgentId> {
    let mut ids = match available_agents {
        Some(available) => available.to_vec(),
        None => agent_ids().collect(),
    };

    if !ids.contains(&config.default_agent) {
        ids.push(config.default_agent);
    }

    let mut seen = HashSet::new();
    ids.into_iter()
        .filter(|agent| seen.insert(*agent))
        .collect()
}

/// Build selectable candidates from config and available agents.
pub fn build_route_candidates(config: &Config, options: &RouteOptions) -> Vec<RouteCandidate> {
    let (default_model_agent, default_model_id) = match &config.default_model {
        Some(default_model) => match parse_model_ref(default_model, config.default_agent) {
            Ok(reference) => (
                reference.agent.unwrap_or(config.default_agent),
                reference.model,
            ),
            Err(_) => (config.default_agent, String::new()),
        },
        None => (config.default_agent, String::new()),
    };

    let mut candidates = Vec::new();
    for agent_id in candidate_agent_order(config, options.available_agents.as_deref()) {
        let agent = config.agents.get(&agent_id);
        if agent.is_some_and(|agent| !agent.enabled) {
            continue;
        }

        if let Some(agent) = agent
            && !agent.models.is_empty()
        {
            candidates.extend(agent.models.iter().map(|model| {
                candidate_for_model(
                    config,
                    agent_id,
                    Some(model),
                    default_model_agent,
                    &default_model_id,
                )
            }));
            continue;
        }

        let fallback_model = if default_model_agent == agent_id && !default_model_id.is_empty() {
            Some(ModelConfig {
                id: default_model_id.clone(),
                label: None,
                strengths: Vec::<ModelStrength>::new(),
                description: None,
                context_window: None,
                cost: None,
                default: Some(true),
            })
        } else {
            None
        };

        candidates.push(candidate_for_model(
            config,
            agent_id,
            fallback_model.as_ref(),
            default_model_agent,
            &default_model_id,
        ));
    }

    dedupe_candidates(candidates)
}

fn default_candidate(candidates: &[RouteCandidate]) -> Result<RouteCandidate, RouteError> {
    candidates
        .iter()
        .find(|candidate| candidate.is_default)
        .or_else(|| candidates.first())
        .cloned()
        .ok_or(RouteError::NoCandidates)
}

fn decision_from_score(
    strategy: RouteStrategy,
    scored: ScoredCandidate,
    matched_rule: Option<RouteRule>,
) -> RouteDecision {
    let reasons = if scored.reasons.is_empty() {
        vec!["fallback target".to_owned()]
    } else {
        scored.reasons.clone()
    };

    RouteDecision {
        agent: scored.candidate.agent,
        model: scored.candidate.model.clone(),
        candidate: scored.candidate,
        strategy,
        score: scored.score,
        rule_matches: scored.rule_matches,
        reasons,
        matched_rule,
    }
}

fn rule_target_label(rule: &RouteRule) -> String {
    [
        rule.r#use.agent.map(|agent| agent.to_string()),
        rule.r#use.model.clone(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(":")
}

fn route_with_rules(
    request: &RouteRequest,
    config: &Config,
    candidates: &[RouteCandidate],
) -> Result<RouteDecision, RouteError> {
    let matches = match_rules(request, &config.routing.rules);

    for matched in matches {
        let matching_candidates: Vec<_> = candidates
            .iter()
            .filter(|candidate| rule_matches_candidate(&matched.rule, candidate))
            .cloned()
            .collect();

        if matching_candidates.is_empty() {
            let target = rule_target_label(&matched.rule);
            return Err(RouteError::RuleTargetUnavailable {
                rule: matched.rule.name,
                target,
            });
        }

        let mut scored = score_candidates(
            request,
            &matching_candidates,
            &config.routing.weights,
            std::slice::from_ref(&matched.rule),
        );
        scored.sort_by(compare_scores);

        if let Some(best) = scored.into_iter().next() {
            return Ok(decision_from_score(
                RouteStrategy::Rules,
                best,
                Some(matched.rule),
            ));
        }
    }

    let fallback = default_candidate(candidates)?;
    let mut scored = score_candidates(
        request,
        std::slice::from_ref(&fallback),
        &config.routing.weights,
        &[],
    );
    let best = scored.pop().ok_or(RouteError::NoCandidates)?;
    Ok(decision_from_score(RouteStrategy::Rules, best, None))
}

fn route_by_score(
    request: &RouteRequest,
    config: &Config,
    candidates: &[RouteCandidate],
    strategy: RoutingStrategy,
) -> Result<RouteDecision, RouteError> {
    let rules = if strategy == RoutingStrategy::Hybrid {
        config.routing.rules.as_slice()
    } else {
        &[]
    };
    let mut scored = score_candidates(request, candidates, &config.routing.weights, rules);
    scored.sort_by(compare_scores);
    let best = scored.into_iter().next().ok_or(RouteError::NoCandidates)?;

    let route_strategy = match strategy {
        RoutingStrategy::Rules => RouteStrategy::Rules,
        RoutingStrategy::Score => RouteStrategy::Score,
        RoutingStrategy::Hybrid => RouteStrategy::Hybrid,
    };
    let matched_rule = if strategy == RoutingStrategy::Hybrid {
        best.rule_matches
            .first()
            .map(|matched| matched.rule.clone())
    } else {
        None
    };

    Ok(decision_from_score(route_strategy, best, matched_rule))
}

/// Check whether local score-based routing needs a user confirmation.
pub fn has_ambiguous_route(
    request: &RouteRequest,
    config: &Config,
    candidates: &[RouteCandidate],
) -> bool {
    let rules = if config.routing.strategy == RoutingStrategy::Hybrid {
        config.routing.rules.as_slice()
    } else {
        &[]
    };
    let mut scored = score_candidates(request, candidates, &config.routing.weights, rules);
    scored.sort_by(compare_scores);

    scored
        .get(0)
        .zip(scored.get(1))
        .is_some_and(|(left, right)| left.score == right.score)
}

/// Select an agent/model pair according to the configured local strategy.
pub fn route(
    request: &RouteRequest,
    config: &Config,
    options: &RouteOptions,
) -> Result<RouteDecision, RouteError> {
    let candidates = options
        .candidates
        .clone()
        .unwrap_or_else(|| build_route_candidates(config, options));

    if candidates.is_empty() {
        return Err(RouteError::NoCandidates);
    }

    match config.routing.strategy {
        RoutingStrategy::Rules => route_with_rules(request, config, &candidates),
        RoutingStrategy::Score => {
            route_by_score(request, config, &candidates, RoutingStrategy::Score)
        }
        RoutingStrategy::Hybrid => {
            route_by_score(request, config, &candidates, RoutingStrategy::Hybrid)
        }
    }
}

/// Select an explicitly requested candidate without applying routing.
pub fn select_candidate(
    candidates: &[RouteCandidate],
    agent: Option<AgentId>,
    model: Option<&str>,
) -> Result<RouteCandidate, RouteError> {
    let matched: Vec<_> = candidates
        .iter()
        .filter(|candidate| agent.is_none_or(|agent| candidate.agent == agent))
        .filter(|candidate| model.is_none_or(|model| candidate.model.as_deref() == Some(model)))
        .collect();

    matched
        .iter()
        .find(|candidate| candidate.is_default)
        .or_else(|| matched.first())
        .map(|candidate| (*candidate).clone())
        .ok_or_else(|| RouteError::NoMatchingCandidate {
            target: [
                agent.map(|agent| agent.to_string()),
                model.map(str::to_owned),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(":"),
        })
}

/// Explicit caller override wins over the workspace config.
pub fn resolve_routing_mode(
    config_mode: RoutingMode,
    override_mode: Option<RoutingMode>,
) -> RoutingMode {
    override_mode.unwrap_or(config_mode)
}
