use serde::{Deserialize, Serialize};

use crate::agent::AgentId;
use crate::model::{ModelCost, ModelStrength};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliCapabilities {
    pub structured_events: bool,
    pub native_resume: bool,
    pub non_interactive_prompt: bool,
    pub explicit_model: bool,
    pub tool_events: bool,
}

pub const fn capabilities_for(agent: AgentId) -> CliCapabilities {
    CliCapabilities {
        structured_events: matches!(agent, AgentId::Omp),
        native_resume: true,
        non_interactive_prompt: true,
        explicit_model: true,
        tool_events: matches!(agent, AgentId::Omp),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbedModel {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProbeResult {
    Ok {
        models: Vec<ProbedModel>,
        capabilities: CliCapabilities,
    },
    Fail {
        reason: String,
    },
}

impl ProbeResult {
    pub fn ok(models: Vec<ProbedModel>, capabilities: CliCapabilities) -> Self {
        Self::Ok {
            models,
            capabilities,
        }
    }

    pub fn fail(reason: impl Into<String>) -> Self {
        Self::Fail {
            reason: reason.into(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProbeDisplayStatus {
    Scanning,
    Found,
    Unprobed,
    NotInstalled,
    Disabled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    pub cli_id: AgentId,
    pub model_id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub is_default: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_native_default: Option<bool>,
    pub capabilities: CliCapabilities,
    pub strengths: Vec<ModelStrength>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost: Option<ModelCost>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
    pub available: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeDisplay {
    pub cli_id: AgentId,
    pub status: ProbeDisplayStatus,
    pub models: Vec<ModelOption>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalog {
    pub probes: Vec<ProbeDisplay>,
    pub options: Vec<ModelOption>,
}
