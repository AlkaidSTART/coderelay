use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::agent::AgentId;
use crate::agents::types::{ProbeResult, ProbedModel, capabilities_for};
use crate::config::Config;
use crate::host::FileSystem;

pub trait ModelProbe {
    fn probe(&self, fs: &dyn FileSystem) -> ProbeResult;
}

#[derive(Debug, Clone)]
pub struct ModelProbeRoots {
    pub codex: PathBuf,
    pub claude: PathBuf,
    pub pi: PathBuf,
    pub omp_root: PathBuf,
    pub omp_agent: PathBuf,
}

fn configured_path(home: &Path, value: Option<&String>, fallback: PathBuf) -> PathBuf {
    let Some(value) = value
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    else {
        return fallback;
    };
    let path = Path::new(value);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        home.join(path)
    }
}

fn env_for_agent<'a>(
    base: &'a BTreeMap<String, String>,
    config: &'a Config,
    agent: AgentId,
) -> BTreeMap<String, String> {
    let mut environment = base.clone();
    if let Some(overrides) = config.agents.get(&agent) {
        environment.extend(overrides.env.clone());
    }
    environment
}

impl ModelProbeRoots {
    pub fn from_config(
        home: &Path,
        environment: &BTreeMap<String, String>,
        config: &Config,
    ) -> Self {
        let codex_env = env_for_agent(environment, config, AgentId::Codex);
        let claude_env = env_for_agent(environment, config, AgentId::Claude);
        let pi_env = env_for_agent(environment, config, AgentId::Pi);
        let omp_env = env_for_agent(environment, config, AgentId::Omp);

        let codex = configured_path(home, codex_env.get("CODEX_HOME"), home.join(".codex"));
        let claude = configured_path(
            home,
            claude_env.get("CLAUDE_CONFIG_DIR"),
            home.join(".claude"),
        );
        let pi = configured_path(
            home,
            pi_env.get("PI_CODING_AGENT_DIR"),
            home.join(".pi/agent"),
        );
        let omp_root = configured_path(home, omp_env.get("PI_CONFIG_DIR"), home.join(".omp"));
        let omp_agent = configured_path(
            home,
            omp_env.get("PI_CODING_AGENT_DIR"),
            omp_root.join("agent"),
        );

        Self {
            codex,
            claude,
            pi,
            omp_root,
            omp_agent,
        }
    }
}

fn read_json(fs: &dyn FileSystem, path: &Path) -> Result<Value, String> {
    let text = fs.read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

fn record(value: &Value) -> Option<&serde_json::Map<String, Value>> {
    value.as_object()
}

fn string(value: &Value) -> Option<String> {
    value.as_str().map(str::to_owned)
}

fn toml_string(text: &str, key: &str) -> Option<String> {
    let parsed: toml::Value = toml::from_str(text).ok()?;
    parsed.as_table()?.get(key)?.as_str().map(str::to_owned)
}

pub struct CodexModelProbe {
    pub config_dir: PathBuf,
}

impl ModelProbe for CodexModelProbe {
    fn probe(&self, fs: &dyn FileSystem) -> ProbeResult {
        let config_file = self.config_dir.join("config.toml");
        let config_text = fs.read_to_string(&config_file).ok().unwrap_or_default();
        let default_id = toml_string(&config_text, "model");
        let configured_catalog = toml_string(&config_text, "model_catalog_json");

        let mut candidate_files = Vec::new();
        if let Some(catalog) = configured_catalog.filter(|value| !value.trim().is_empty()) {
            let path = Path::new(&catalog);
            candidate_files.push(if path.is_absolute() {
                path.to_path_buf()
            } else {
                self.config_dir.join(path)
            });
        }
        candidate_files.push(self.config_dir.join("models_cache.json"));
        candidate_files.push(self.config_dir.join("cc-switch-model-catalog.json"));

        let mut catalog: Option<(PathBuf, Value)> = None;
        for file in candidate_files {
            if let Ok(value) = read_json(fs, &file) {
                catalog = Some((file, value));
                break;
            }
        }

        let Some((catalog_file, value)) = catalog else {
            return match default_id {
                Some(id) => ProbeResult::ok(
                    vec![ProbedModel {
                        id,
                        label: None,
                        description: None,
                        is_default: Some(true),
                    }],
                    capabilities_for(AgentId::Codex),
                ),
                None => ProbeResult::fail("codex 模型配置缺失：未找到 models_cache.json"),
            };
        };

        let Some(raw_models) = value.get("models").and_then(Value::as_array) else {
            return ProbeResult::fail(format!(
                "codex 模型目录格式非法：{}",
                catalog_file.display()
            ));
        };

        let mut models: Vec<ProbedModel> = raw_models
            .iter()
            .filter_map(|entry| {
                let entry = entry.as_object()?;
                let id = entry.get("slug")?.as_str()?.trim();
                if id.is_empty() {
                    return None;
                }
                Some(ProbedModel {
                    id: id.to_owned(),
                    label: entry.get("display_name").and_then(string),
                    description: entry.get("description").and_then(string),
                    is_default: None,
                })
            })
            .collect();

        if models.is_empty() {
            return match default_id {
                Some(id) => ProbeResult::ok(
                    vec![ProbedModel {
                        id,
                        label: None,
                        description: None,
                        is_default: Some(true),
                    }],
                    capabilities_for(AgentId::Codex),
                ),
                None => {
                    ProbeResult::fail(format!("codex 模型目录为空：{}", catalog_file.display()))
                }
            };
        }

        if let Some(default_id) = &default_id {
            for model in &mut models {
                model.is_default = Some(model.id == *default_id);
            }
            if !models.iter().any(|model| model.id == *default_id) {
                models.insert(
                    0,
                    ProbedModel {
                        id: default_id.clone(),
                        label: None,
                        description: None,
                        is_default: Some(true),
                    },
                );
            }
        }

        ProbeResult::ok(models, capabilities_for(AgentId::Codex))
    }
}

pub struct ClaudeModelProbe {
    pub config_dir: PathBuf,
}

impl ModelProbe for ClaudeModelProbe {
    fn probe(&self, fs: &dyn FileSystem) -> ProbeResult {
        let settings_file = self.config_dir.join("settings.json");
        let value = match read_json(fs, &settings_file) {
            Ok(value) => value,
            Err(_) => {
                return ProbeResult::fail(format!("claude 配置缺失：{}", settings_file.display()));
            }
        };
        let Some(root) = record(&value) else {
            return ProbeResult::fail(format!("claude 配置格式非法：{}", settings_file.display()));
        };

        let mut ids = BTreeSet::new();
        if let Some(environment) = root.get("env").and_then(record) {
            for key in [
                "ANTHROPIC_DEFAULT_OPUS_MODEL",
                "ANTHROPIC_DEFAULT_SONNET_MODEL",
                "ANTHROPIC_DEFAULT_HAIKU_MODEL",
                "ANTHROPIC_DEFAULT_FABLE_MODEL",
                "CLAUDE_CODE_SUBAGENT_MODEL",
            ] {
                if let Some(id) = environment.get(key).and_then(Value::as_str) {
                    let id = id.trim();
                    if !id.is_empty() {
                        ids.insert(id.to_owned());
                    }
                }
            }
        }
        let configured = root
            .get("model")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if let Some(configured) = configured {
            ids.insert(configured.to_owned());
        }

        if ids.is_empty() {
            return ProbeResult::fail(format!(
                "claude 未配置任何模型：{}",
                settings_file.display()
            ));
        }

        let models = ids
            .into_iter()
            .map(|id| ProbedModel {
                is_default: configured.map(|configured| configured == id),
                id,
                label: None,
                description: None,
            })
            .collect();
        ProbeResult::ok(models, capabilities_for(AgentId::Claude))
    }
}

pub struct PiModelProbe {
    pub config_dir: PathBuf,
}

impl ModelProbe for PiModelProbe {
    fn probe(&self, fs: &dyn FileSystem) -> ProbeResult {
        let models_file = self.config_dir.join("models.json");
        let value = match fs.read_to_string(&models_file) {
            Ok(text) => match serde_json::from_str::<Value>(&text) {
                Ok(value) => value,
                Err(_) => {
                    return ProbeResult::fail(format!(
                        "pi 模型配置格式非法：{}",
                        models_file.display()
                    ));
                }
            },
            Err(error) if error.is_not_found() => {
                return ProbeResult::ok(
                    vec![ProbedModel {
                        id: String::new(),
                        label: Some("Pi 默认模型".to_owned()),
                        description: None,
                        is_default: Some(true),
                    }],
                    capabilities_for(AgentId::Pi),
                );
            }
            Err(_) => {
                return ProbeResult::fail(format!(
                    "pi 模型配置读取失败：{}",
                    models_file.display()
                ));
            }
        };

        let Some(providers) = value.get("providers").and_then(record) else {
            return ProbeResult::fail(format!("pi 模型配置格式非法：{}", models_file.display()));
        };

        let mut models = Vec::new();
        for (provider_key, provider) in providers {
            let provider_id = provider_key.trim();
            if provider_id.is_empty() {
                continue;
            }
            let Some(provider) = record(provider) else {
                continue;
            };
            let Some(entries) = provider.get("models").and_then(Value::as_array) else {
                continue;
            };
            for entry in entries {
                let Some(entry) = record(entry) else {
                    continue;
                };
                let raw_id = entry
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .unwrap_or_default();
                if raw_id.is_empty() {
                    continue;
                }
                let id = if raw_id.starts_with(&format!("{provider_id}/")) {
                    raw_id.to_owned()
                } else {
                    format!("{provider_id}/{raw_id}")
                };
                models.push(ProbedModel {
                    id,
                    label: entry.get("name").and_then(string),
                    description: None,
                    is_default: None,
                });
            }
        }

        if models.is_empty() {
            ProbeResult::fail(format!("pi 模型列表为空：{}", models_file.display()))
        } else {
            ProbeResult::ok(models, capabilities_for(AgentId::Pi))
        }
    }
}

fn omp_model_id_is_valid(value: &str) -> bool {
    let trimmed = value.trim();
    let Some((provider, model)) = trimmed.split_once('/') else {
        return false;
    };
    !provider.is_empty() && !model.is_empty() && !trimmed.chars().any(char::is_whitespace)
}

fn add_omp_model(
    models: &mut BTreeMap<String, ProbedModel>,
    id: &str,
    label: Option<&str>,
    is_default: bool,
) {
    let id = id.trim();
    if !omp_model_id_is_valid(id) {
        return;
    }
    let previous = models.get(id);
    let resolved_label = label
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .map(str::to_owned)
        .or_else(|| previous.and_then(|model| model.label.clone()));
    models.insert(
        id.to_owned(),
        ProbedModel {
            id: id.to_owned(),
            label: resolved_label,
            description: None,
            is_default: if is_default || previous.and_then(|model| model.is_default) == Some(true) {
                Some(true)
            } else {
                None
            },
        },
    );
}

fn collect_omp_models(value: &Value, models: &mut BTreeMap<String, ProbedModel>) -> Option<String> {
    let mut default_id = None;
    if let Some(roles) = value.get("modelRoles").and_then(record) {
        for (role, value) in roles {
            let Some(model_id) = value.as_str().map(str::trim) else {
                continue;
            };
            if !omp_model_id_is_valid(model_id) {
                continue;
            }
            let is_default = role == "default";
            add_omp_model(models, model_id, None, is_default);
            if is_default {
                default_id = Some(model_id.to_owned());
            }
        }
    }

    if let Some(providers) = value.get("providers").and_then(record) {
        for (provider_key, provider) in providers {
            let provider_id = provider_key.trim();
            if provider_id.is_empty() {
                continue;
            }
            let Some(provider) = record(provider) else {
                continue;
            };

            if let Some(entries) = provider.get("models").and_then(Value::as_array) {
                for entry in entries {
                    let Some(entry) = record(entry) else {
                        continue;
                    };
                    let Some(raw_id) = entry.get("id").and_then(Value::as_str) else {
                        continue;
                    };
                    let raw_id = raw_id.trim();
                    let id = if raw_id.starts_with(&format!("{provider_id}/")) {
                        raw_id.to_owned()
                    } else {
                        format!("{provider_id}/{raw_id}")
                    };
                    add_omp_model(
                        models,
                        &id,
                        entry.get("name").and_then(Value::as_str),
                        false,
                    );
                }
            }

            if let Some(overrides) = provider.get("modelOverrides").and_then(record) {
                for model_key in overrides.keys() {
                    let id = if model_key.starts_with(&format!("{provider_id}/")) {
                        model_key.to_owned()
                    } else {
                        format!("{provider_id}/{model_key}")
                    };
                    add_omp_model(models, &id, None, false);
                }
            }
        }
    }

    default_id
}

fn omp_native_default() -> ProbeResult {
    ProbeResult::ok(
        vec![ProbedModel {
            id: String::new(),
            label: Some("OMP 默认模型".to_owned()),
            description: None,
            is_default: Some(true),
        }],
        capabilities_for(AgentId::Omp),
    )
}

pub struct OmpModelProbe {
    pub agent_dir: PathBuf,
}

impl ModelProbe for OmpModelProbe {
    fn probe(&self, fs: &dyn FileSystem) -> ProbeResult {
        let mut models = BTreeMap::new();
        let mut default_id = None;

        if let Ok(text) = fs.read_to_string(&self.agent_dir.join("config.yml"))
            && let Ok(value) = serde_norway::from_str::<Value>(&text)
        {
            default_id = collect_omp_models(&value, &mut models);
        }

        for file_name in ["models.yml", "models.yaml", "models.json"] {
            let file = self.agent_dir.join(file_name);
            let Ok(text) = fs.read_to_string(&file) else {
                continue;
            };
            let value = if file_name.ends_with(".json") {
                serde_json::from_str::<Value>(&text).ok()
            } else {
                serde_norway::from_str::<Value>(&text).ok()
            };
            if let Some(value) = value {
                collect_omp_models(&value, &mut models);
            }
        }

        if let Some(default_id) = default_id
            && let Some(default_model) = models.get_mut(&default_id)
        {
            default_model.is_default = Some(true);
        }

        if models.is_empty() {
            omp_native_default()
        } else {
            ProbeResult::ok(
                models.into_values().collect(),
                capabilities_for(AgentId::Omp),
            )
        }
    }
}

pub type ModelProbeRegistry = BTreeMap<AgentId, Box<dyn ModelProbe>>;

pub fn create_model_probes(roots: ModelProbeRoots) -> ModelProbeRegistry {
    BTreeMap::from([
        (
            AgentId::Codex,
            Box::new(CodexModelProbe {
                config_dir: roots.codex,
            }) as Box<dyn ModelProbe>,
        ),
        (
            AgentId::Claude,
            Box::new(ClaudeModelProbe {
                config_dir: roots.claude,
            }),
        ),
        (
            AgentId::Pi,
            Box::new(PiModelProbe {
                config_dir: roots.pi,
            }),
        ),
        (
            AgentId::Omp,
            Box::new(OmpModelProbe {
                agent_dir: roots.omp_agent,
            }),
        ),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toml_probe_reads_top_level_model_keys() {
        let text = "model = \"gpt-5\"\nmodel_catalog_json = \"models_cache.json\"\n";
        assert_eq!(toml_string(text, "model").as_deref(), Some("gpt-5"));
        assert_eq!(
            toml_string(text, "model_catalog_json").as_deref(),
            Some("models_cache.json")
        );
    }
}
