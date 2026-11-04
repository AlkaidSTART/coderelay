use serde::{Deserialize, Serialize};

use crate::agent::AgentId;
use crate::config::RouteRule;
use crate::model::{ModelCost, ModelStrength};

/// User-visible routing mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum RoutingMode {
    #[default]
    Local,
    Manual,
    Jev,
}

/// Strategy configured for local routing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum RoutingStrategy {
    Rules,
    Score,
    #[default]
    Hybrid,
}

/// Strategy recorded on a completed route decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RouteStrategy {
    Rules,
    Score,
    Hybrid,
    Jev,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RouteRequest {
    pub prompt: String,
    pub files: Option<Vec<String>>,
    pub language: Option<String>,
    pub context_size: Option<u64>,
    pub required_strengths: Option<Vec<ModelStrength>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteCandidate {
    pub agent: AgentId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub strengths: Vec<ModelStrength>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost: Option<ModelCost>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
    pub is_default: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleMatch {
    pub rule: RouteRule,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredCandidate {
    pub candidate: RouteCandidate,
    pub score: f64,
    pub rule_matches: Vec<RuleMatch>,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteDecision {
    pub agent: AgentId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub candidate: RouteCandidate,
    pub strategy: RouteStrategy,
    pub score: f64,
    pub rule_matches: Vec<RuleMatch>,
    pub reasons: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub matched_rule: Option<RouteRule>,
}

#[derive(Debug, Clone, Default)]
pub struct RouteOptions {
    /// Restrict routing to these agents, in caller-provided order.
    pub available_agents: Option<Vec<AgentId>>,
    /// Supply precomputed candidates instead of deriving them from config.
    pub candidates: Option<Vec<RouteCandidate>>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RouteError {
    #[error("no route candidates are available")]
    NoCandidates,
    #[error(
        "rule \"{rule}\" matched, but target \"{target}\" is not available; refusing silent fallback"
    )]
    RuleTargetUnavailable { rule: String, target: String },
    #[error("no candidate matches {target}")]
    NoMatchingCandidate { target: String },
    #[error("invalid routing configuration: {0}")]
    InvalidConfiguration(String),
}
