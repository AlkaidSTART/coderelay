//! Configuration schema, validation, discovery, and loading.
//!
//! The YAML shape intentionally matches the TypeScript implementation that is
//! being migrated. Unknown keys are ignored, while every known field is
//! validated before the config reaches routing or a host application.

use std::collections::{BTreeMap, HashSet};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::agent::AgentId;
use crate::model::{ModelConfig, parse_model_ref};
use crate::routing::{RoutingMode, RoutingStrategy};

pub const CONFIG_VERSION: u8 = 1;
pub const CONFIG_DIR: &str = ".coderelay";
pub const CONFIG_FILE_NAMES: [&str; 4] = [
    ".coderelay/config.yaml",
    ".coderelay/config.yml",
    "coderelay.config.yaml",
    "coderelay.config.yml",
];

fn default_config_version() -> u8 {
    CONFIG_VERSION
}

fn default_agent() -> AgentId {
    AgentId::Codex
}

fn default_enabled() -> bool {
    true
}

fn default_rule_score() -> f64 {
    10.0
}

fn default_strength_weight() -> f64 {
    1.0
}

fn default_rule_weight() -> f64 {
    1.0
}

fn default_default_weight() -> f64 {
    2.0
}

fn default_cost_weight() -> f64 {
    0.5
}

fn default_context_weight() -> f64 {
    1.0
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentConfig {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub activation_decided: bool,
    pub command: Option<String>,
    pub models: Vec<ModelConfig>,
    pub extra_args: Vec<String>,
    pub env: BTreeMap<String, String>,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            activation_decided: false,
            command: None,
            models: Vec::new(),
            extra_args: Vec::new(),
            env: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RuleWhen {
    pub keywords: Option<Vec<String>>,
    pub patterns: Option<Vec<String>>,
    pub languages: Option<Vec<String>>,
    pub files: Option<Vec<String>>,
    pub min_prompt_length: Option<u64>,
    pub max_prompt_length: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RuleUse {
    pub agent: Option<AgentId>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RouteRule {
    pub name: String,
    pub description: Option<String>,
    pub priority: i32,
    pub when: Option<RuleWhen>,
    #[serde(rename = "use")]
    pub r#use: RuleUse,
    #[serde(default = "default_rule_score")]
    pub score: f64,
}

impl Default for RouteRule {
    fn default() -> Self {
        Self {
            name: String::new(),
            description: None,
            priority: 0,
            when: None,
            r#use: RuleUse::default(),
            score: default_rule_score(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RoutingWeights {
    #[serde(default = "default_strength_weight")]
    pub strength: f64,
    #[serde(default = "default_rule_weight")]
    pub rule: f64,
    #[serde(default = "default_default_weight")]
    pub default: f64,
    #[serde(default = "default_cost_weight")]
    pub cost: f64,
    #[serde(default = "default_context_weight")]
    pub context: f64,
}

impl Default for RoutingWeights {
    fn default() -> Self {
        Self {
            strength: default_strength_weight(),
            rule: default_rule_weight(),
            default: default_default_weight(),
            cost: default_cost_weight(),
            context: default_context_weight(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RoutingConfig {
    pub mode: RoutingMode,
    pub strategy: RoutingStrategy,
    pub typesafe_api_key: Option<String>,
    pub typesafe_endpoint: Option<String>,
    pub rules: Vec<RouteRule>,
    pub weights: RoutingWeights,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    #[serde(default = "default_config_version")]
    pub version: u8,
    #[serde(default = "default_agent")]
    pub default_agent: AgentId,
    pub default_model: Option<String>,
    pub agents: BTreeMap<AgentId, AgentConfig>,
    pub routing: RoutingConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            default_agent: default_agent(),
            default_model: None,
            agents: BTreeMap::new(),
            routing: RoutingConfig::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigValidationIssue {
    pub path: String,
    pub message: String,
}

impl fmt::Display for ConfigValidationIssue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.path, self.message)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigValidationErrors {
    pub issues: Vec<ConfigValidationIssue>,
}

impl fmt::Display for ConfigValidationErrors {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (index, issue) in self.issues.iter().enumerate() {
            if index > 0 {
                formatter.write_str("\n")?;
            }
            write!(formatter, "{issue}")?;
        }
        Ok(())
    }
}

impl std::error::Error for ConfigValidationErrors {}

#[derive(Debug, thiserror::Error)]
pub enum ConfigParseError {
    #[error("invalid YAML: {0}")]
    Yaml(String),
    #[error(transparent)]
    Validation(#[from] ConfigValidationErrors),
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("config file not found: {path}")]
    NotFound { path: PathBuf },
    #[error("invalid YAML in {path}: {message}")]
    InvalidYaml { path: PathBuf, message: String },
    #[error("invalid config in {path}:\n{errors}")]
    InvalidConfig {
        path: PathBuf,
        errors: ConfigValidationErrors,
    },
    #[error("failed to read config {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to resolve the current directory: {0}")]
    CurrentDirectory(std::io::Error),
}

#[derive(Debug, Clone)]
pub struct LoadConfigOptions {
    pub cwd: PathBuf,
    pub path: Option<PathBuf>,
    pub home_dir: Option<PathBuf>,
    pub coderelay_home: Option<PathBuf>,
    pub allow_missing: bool,
}

impl LoadConfigOptions {
    pub fn new(cwd: impl Into<PathBuf>) -> Self {
        Self {
            cwd: cwd.into(),
            path: None,
            home_dir: dirs::home_dir(),
            coderelay_home: std::env::var_os("CODERELAY_HOME").map(PathBuf::from),
            allow_missing: true,
        }
    }

    pub fn with_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.path = Some(path.into());
        self
    }

    pub fn with_home_dir(mut self, home_dir: impl Into<PathBuf>) -> Self {
        self.home_dir = Some(home_dir.into());
        self.coderelay_home = None;
        self
    }

    pub fn with_coderelay_home(mut self, coderelay_home: impl Into<PathBuf>) -> Self {
        self.coderelay_home = Some(coderelay_home.into());
        self
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct LoadedConfig {
    pub config: Config,
    pub path: Option<PathBuf>,
    pub cwd: PathBuf,
    pub used_defaults: bool,
}

/// A fully-populated config containing only documented defaults.
pub fn default_config() -> Config {
    Config::default()
}

/// Parse, normalize, and validate the YAML representation of a config.
pub fn parse_config_yaml(raw: &str) -> Result<Config, ConfigParseError> {
    let mut config: Config = if raw.trim().is_empty() {
        Config::default()
    } else {
        serde_norway::from_str(raw).map_err(|error| ConfigParseError::Yaml(error.to_string()))?
    };

    config.normalize();
    config.validate()?;
    Ok(config)
}

impl Config {
    pub fn validate(&self) -> Result<(), ConfigValidationErrors> {
        let mut issues = Vec::new();

        if self.version != CONFIG_VERSION {
            issues.push(issue("version", format!("must be {CONFIG_VERSION}")));
        }

        let has_enabled_agent = self.agents.values().any(|agent| agent.enabled);
        if has_enabled_agent
            && self
                .agents
                .get(&self.default_agent)
                .is_some_and(|agent| !agent.enabled)
        {
            issues.push(issue(
                "defaultAgent",
                format!(
                    "\"{}\" is disabled; choose an enabled agent as defaultAgent",
                    self.default_agent
                ),
            ));
        }

        for (agent_id, agent) in &self.agents {
            let agent_path = format!("agents.{}", agent_id.as_str());
            if let Some(command) = &agent.command
                && command.trim().is_empty()
            {
                issues.push(issue(
                    format!("{agent_path}.command"),
                    "command must not be empty",
                ));
            }

            let mut model_ids = HashSet::new();
            let mut default_models = Vec::new();
            for (index, model) in agent.models.iter().enumerate() {
                let model_path = format!("{agent_path}.models[{index}]");
                if model.id.trim().is_empty() {
                    issues.push(issue(
                        format!("{model_path}.id"),
                        "model id must not be empty",
                    ));
                }
                if !model_ids.insert(model.id.as_str()) {
                    issues.push(issue(
                        format!("{model_path}.id"),
                        format!(
                            "duplicate model id \"{}\" in agent \"{agent_id}\"",
                            model.id
                        ),
                    ));
                }
                if model.default == Some(true) {
                    default_models.push(model.id.as_str());
                }
                if model.context_window == Some(0) {
                    issues.push(issue(
                        format!("{model_path}.contextWindow"),
                        "contextWindow must be positive",
                    ));
                }
            }

            if default_models.len() > 1 {
                issues.push(issue(
                    format!("{agent_path}.models"),
                    format!(
                        "agent \"{agent_id}\" has multiple default models: {}",
                        default_models.join(", ")
                    ),
                ));
            }
        }

        if let Some(default_model) = &self.default_model {
            self.validate_default_model(default_model, &mut issues);
        }

        for (index, rule) in self.routing.rules.iter().enumerate() {
            self.validate_rule(index, rule, &mut issues);
        }

        self.validate_weights(&mut issues);

        if issues.is_empty() {
            Ok(())
        } else {
            Err(ConfigValidationErrors { issues })
        }
    }

    fn validate_default_model(&self, default_model: &str, issues: &mut Vec<ConfigValidationIssue>) {
        let trimmed = default_model.trim();
        if trimmed.is_empty() {
            issues.push(issue("defaultModel", "must not be empty"));
            return;
        }

        let reference = match parse_model_ref(trimmed, self.default_agent) {
            Ok(reference) => reference,
            Err(error) => {
                issues.push(issue("defaultModel", error.to_string()));
                return;
            }
        };

        if reference.model.is_empty() {
            issues.push(issue("defaultModel", "model id must not be empty"));
            return;
        }

        let referenced_agent = reference.agent.unwrap_or(self.default_agent);
        if referenced_agent != self.default_agent {
            issues.push(issue(
                "defaultModel",
                format!(
                    "must target defaultAgent \"{}\", got \"{referenced_agent}\"",
                    self.default_agent
                ),
            ));
            return;
        }

        if let Some(agent) = self.agents.get(&self.default_agent)
            && !agent.models.is_empty()
            && !agent.models.iter().any(|model| model.id == reference.model)
        {
            issues.push(issue(
                "defaultModel",
                format!(
                    "model is not configured for {}: {}",
                    self.default_agent, reference.model
                ),
            ));
        }
    }

    fn validate_rule(
        &self,
        index: usize,
        rule: &RouteRule,
        issues: &mut Vec<ConfigValidationIssue>,
    ) {
        let rule_path = format!("routing.rules[{index}]");

        if rule.name.trim().is_empty() {
            issues.push(issue(format!("{rule_path}.name"), "must not be empty"));
        }
        if !rule.score.is_finite() {
            issues.push(issue(format!("{rule_path}.score"), "must be finite"));
        }

        if let Some(when) = &rule.when {
            validate_non_empty_strings(
                &format!("{rule_path}.when.keywords"),
                when.keywords.as_deref(),
                issues,
            );
            validate_non_empty_strings(
                &format!("{rule_path}.when.languages"),
                when.languages.as_deref(),
                issues,
            );
            validate_non_empty_strings(
                &format!("{rule_path}.when.files"),
                when.files.as_deref(),
                issues,
            );

            if let Some(patterns) = &when.patterns {
                for (pattern_index, pattern) in patterns.iter().enumerate() {
                    if pattern.is_empty() {
                        issues.push(issue(
                            format!("{rule_path}.when.patterns[{pattern_index}]"),
                            "must not be empty",
                        ));
                    } else if let Err(error) = Regex::new(pattern) {
                        issues.push(issue(
                            format!("{rule_path}.when.patterns[{pattern_index}]"),
                            format!("must be a valid regular expression: {error}"),
                        ));
                    }
                }
            }

            if let (Some(min), Some(max)) = (when.min_prompt_length, when.max_prompt_length)
                && min > max
            {
                issues.push(issue(
                    format!("{rule_path}.when.minPromptLength"),
                    "minPromptLength cannot be greater than maxPromptLength",
                ));
            }
        }

        let Some(agent) = rule.r#use.agent else {
            let Some(model) = rule.r#use.model.as_deref() else {
                issues.push(issue(
                    format!("{rule_path}.use"),
                    "must specify at least an agent or a model",
                ));
                return;
            };
            let trimmed = model.trim();
            if trimmed.is_empty() {
                issues.push(issue(format!("{rule_path}.use.model"), "must not be empty"));
                return;
            }

            let enabled_agents_with_models: Vec<_> = self
                .agents
                .iter()
                .filter(|(_, configured)| configured.enabled && !configured.models.is_empty())
                .collect();
            if !enabled_agents_with_models.is_empty()
                && !enabled_agents_with_models
                    .iter()
                    .any(|(_, configured)| configured.models.iter().any(|item| item.id == trimmed))
            {
                issues.push(issue(
                    format!("{rule_path}.use.model"),
                    format!("model is not configured for any enabled agent: {trimmed}"),
                ));
            }
            return;
        };

        if self
            .agents
            .get(&agent)
            .is_some_and(|configured| !configured.enabled)
        {
            issues.push(issue(
                format!("{rule_path}.use.agent"),
                format!("agent \"{agent}\" is disabled"),
            ));
        }

        if let Some(model) = rule.r#use.model.as_deref() {
            let trimmed = model.trim();
            if trimmed.is_empty() {
                issues.push(issue(format!("{rule_path}.use.model"), "must not be empty"));
                return;
            }
            if let Some(configured) = self.agents.get(&agent)
                && !configured.models.is_empty()
                && !configured.models.iter().any(|item| item.id == trimmed)
            {
                issues.push(issue(
                    format!("{rule_path}.use.model"),
                    format!("model is not configured for {agent}: {trimmed}"),
                ));
            }
        }
    }

    fn validate_weights(&self, issues: &mut Vec<ConfigValidationIssue>) {
        let weights = &self.routing.weights;
        for (field, value) in [
            ("strength", weights.strength),
            ("rule", weights.rule),
            ("default", weights.default),
            ("cost", weights.cost),
            ("context", weights.context),
        ] {
            if !value.is_finite() || value < 0.0 {
                issues.push(issue(
                    format!("routing.weights.{field}"),
                    "weight must be a finite non-negative number",
                ));
            }
        }
    }

    fn normalize(&mut self) {
        if let Some(default_model) = &mut self.default_model {
            *default_model = default_model.trim().to_owned();
        }

        for agent in self.agents.values_mut() {
            if let Some(command) = &mut agent.command {
                *command = command.trim().to_owned();
            }
            for model in &mut agent.models {
                model.id = model.id.trim().to_owned();
            }
        }

        for rule in &mut self.routing.rules {
            if let Some(model) = &mut rule.r#use.model {
                *model = model.trim().to_owned();
            }
        }
    }
}

fn validate_non_empty_strings(
    path: &str,
    values: Option<&[String]>,
    issues: &mut Vec<ConfigValidationIssue>,
) {
    let Some(values) = values else {
        return;
    };

    for (index, value) in values.iter().enumerate() {
        if value.is_empty() {
            issues.push(issue(format!("{path}[{index}]"), "must not be empty"));
        }
    }
}

fn issue(path: impl Into<String>, message: impl Into<String>) -> ConfigValidationIssue {
    ConfigValidationIssue {
        path: path.into(),
        message: message.into(),
    }
}

/// Directory that holds a project-level config file.
pub fn config_dir_for(cwd: &Path) -> PathBuf {
    cwd.join(CONFIG_DIR)
}

/// Resolve the global config directory from an explicit home or a
/// `CODERELAY_HOME` override.
pub fn global_config_dir(
    home_dir: Option<&Path>,
    coderelay_home: Option<&Path>,
) -> Option<PathBuf> {
    if let Some(explicit) = coderelay_home {
        return Some(
            if explicit.file_name().is_some_and(|name| name == CONFIG_DIR) {
                explicit.to_path_buf()
            } else {
                explicit.join(CONFIG_DIR)
            },
        );
    }

    home_dir.map(|home| home.join(CONFIG_DIR))
}

pub fn default_config_path(
    home_dir: Option<&Path>,
    coderelay_home: Option<&Path>,
) -> Option<PathBuf> {
    global_config_dir(home_dir, coderelay_home).map(|dir| dir.join("config.yaml"))
}

/// Walk up from `start_dir`, then check the global config directory.
pub fn find_config_path(
    start_dir: &Path,
    home_dir: Option<&Path>,
    coderelay_home: Option<&Path>,
) -> Option<PathBuf> {
    for directory in start_dir.ancestors() {
        for name in CONFIG_FILE_NAMES {
            let candidate = directory.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    let global_dir = global_config_dir(home_dir, coderelay_home)?;
    for name in ["config.yaml", "config.yml"] {
        let candidate = global_dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

/// Load and validate a config, optionally returning defaults when missing.
pub fn load_config(options: &LoadConfigOptions) -> Result<LoadedConfig, ConfigError> {
    let cwd = if options.cwd.is_absolute() {
        options.cwd.clone()
    } else {
        std::env::current_dir()
            .map_err(ConfigError::CurrentDirectory)?
            .join(&options.cwd)
    };

    let path = if let Some(explicit) = &options.path {
        Some(if explicit.is_absolute() {
            explicit.clone()
        } else {
            cwd.join(explicit)
        })
    } else {
        find_config_path(
            &cwd,
            options.home_dir.as_deref(),
            options.coderelay_home.as_deref(),
        )
    };

    let Some(path) = path else {
        if options.allow_missing {
            return Ok(LoadedConfig {
                config: default_config(),
                path: None,
                cwd,
                used_defaults: true,
            });
        }

        return Err(ConfigError::NotFound {
            path: default_config_path(
                options.home_dir.as_deref(),
                options.coderelay_home.as_deref(),
            )
            .unwrap_or_else(|| cwd.join(CONFIG_DIR).join("config.yaml")),
        });
    };

    if !path.is_file() {
        return Err(ConfigError::NotFound { path });
    }

    let raw = fs::read_to_string(&path).map_err(|source| ConfigError::Io {
        path: path.clone(),
        source,
    })?;

    let config = parse_config_yaml(&raw).map_err(|error| match error {
        ConfigParseError::Yaml(message) => ConfigError::InvalidYaml {
            path: path.clone(),
            message,
        },
        ConfigParseError::Validation(errors) => ConfigError::InvalidConfig {
            path: path.clone(),
            errors,
        },
    })?;

    Ok(LoadedConfig {
        config,
        path: Some(path),
        cwd,
        used_defaults: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rule_defaults_use_the_same_values_as_the_typescript_schema() {
        let config = parse_config_yaml(
            "routing:\n  rules:\n    - name: default\n      use:\n        agent: codex\n",
        )
        .expect("parse rule");

        let rule = &config.routing.rules[0];
        assert_eq!(rule.priority, 0);
        assert_eq!(rule.score, 10.0);
        assert_eq!(config.routing.weights.default, 2.0);
    }
}
