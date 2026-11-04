use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::agent::AgentId;
use crate::model::ModelStrength;
use crate::router::types::{RouteCandidate, RouteDecision, RouteRequest, RouteStrategy};

pub const TYPESAFE_DEFAULT_ENDPOINT: &str = "https://api.typesafe.ai/v1/systemone";
pub const TYPESAFE_DEFAULT_MODEL: &str = "jev-latest";
pub const TYPESAFE_ENV_KEY: &str = "TYPESAFE_API_KEY";
/// SQLite preference key used by host UIs for the TypeSafe API key.
pub const TYPESAFE_API_KEY_PREFERENCE: &str = "typesafe_api_key";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JevQuestionKind {
    Choice,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JevQuestionChoice {
    #[serde(rename = "type")]
    pub kind: JevQuestionKind,
    pub instructions: String,
    pub criteria: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JevRequestBody {
    pub state: String,
    pub model: String,
    pub questions: BTreeMap<String, JevQuestionChoice>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JevChoiceAnswer {
    #[serde(rename = "type")]
    pub kind: JevQuestionKind,
    pub choice: String,
    pub confidence: f64,
    pub probabilities: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct JevUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JevResponseBody {
    pub model: String,
    pub answers: BTreeMap<String, Option<JevChoiceAnswer>>,
    #[serde(default)]
    pub usage: Option<JevUsage>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JevDecision {
    pub agent: AgentId,
    pub model: Option<String>,
    pub candidate: RouteCandidate,
    pub confidence: f64,
    pub probabilities: BTreeMap<String, f64>,
    pub raw_choice: String,
    pub model_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<JevUsage>,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum JevError {
    #[error("no route candidates available for Jev decision")]
    NoCandidates,
    #[error("TYPESAFE_API_KEY is not configured")]
    NoKey,
    #[error("Jev request timed out after {timeout_ms}ms")]
    Timeout { timeout_ms: u64 },
    #[error("TypeSafe API returned HTTP {status}: {message}")]
    Http { status: u16, message: String },
    #[error("invalid Jev API response structure: {0}")]
    InvalidResponse(String),
    #[error("Jev API returned unknown choice \"{choice}\"")]
    InvalidChoice { choice: String },
    #[error("Jev API response missing 'decision' answer")]
    NoChoice,
}

/// Host-provided Jev transport. Core routing never reads files or performs HTTP.
pub trait JevClient: Send + Sync {
    fn decide(
        &self,
        request: &RouteRequest,
        candidates: &[RouteCandidate],
    ) -> impl std::future::Future<Output = Result<JevDecision, JevError>> + Send;
}

pub fn format_candidate_key(candidate: &RouteCandidate) -> String {
    match &candidate.model {
        Some(model) => format!("{}:{model}", candidate.agent),
        None => candidate.agent.to_string(),
    }
}

fn strengths_label(strengths: &[ModelStrength]) -> String {
    strengths
        .iter()
        .map(|strength| strength.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}

pub fn build_jev_request(
    request: &RouteRequest,
    candidates: &[RouteCandidate],
    model: &str,
) -> JevRequestBody {
    let criteria = candidates
        .iter()
        .map(|candidate| {
            let mut parts = Vec::new();
            if let Some(label) = &candidate.label {
                parts.push(label.clone());
            }
            if !candidate.strengths.is_empty() {
                parts.push(format!(
                    "strengths: {}",
                    strengths_label(&candidate.strengths)
                ));
            }
            if let Some(cost) = candidate.cost {
                parts.push(format!("cost: {}/5", u8::from(cost)));
            }
            if let Some(context_window) = candidate.context_window {
                parts.push(format!("context window: {context_window} tokens"));
            }
            if candidate.is_default {
                parts.push("default agent".to_owned());
            }

            let description = if parts.is_empty() {
                candidate.agent.to_string()
            } else {
                parts.join("; ")
            };
            (format_candidate_key(candidate), description)
        })
        .collect();

    let mut state = vec![request.prompt.clone()];
    if let Some(language) = &request.language {
        state.push(format!("Language: {language}"));
    }
    if let Some(files) = &request.files
        && !files.is_empty()
    {
        state.push(format!("Files: {}", files.join(", ")));
    }
    if let Some(context_size) = request.context_size {
        state.push(format!("Context size: {context_size} tokens"));
    }
    if let Some(required) = &request.required_strengths
        && !required.is_empty()
    {
        state.push(format!("Required strengths: {}", strengths_label(required)));
    }

    let questions = BTreeMap::from([(
        "decision".to_owned(),
        JevQuestionChoice {
            kind: JevQuestionKind::Choice,
            instructions:
                "Select the single most suitable coding agent or model for this coding task."
                    .to_owned(),
            criteria,
        },
    )]);

    JevRequestBody {
        state: state.join("\n"),
        model: model.to_owned(),
        questions,
    }
}

impl JevDecision {
    pub fn to_route_decision(&self) -> RouteDecision {
        let percent = (self.confidence * 100.0).round() as i64;
        RouteDecision {
            agent: self.agent,
            model: self.model.clone(),
            candidate: self.candidate.clone(),
            strategy: RouteStrategy::Jev,
            score: self.confidence,
            rule_matches: Vec::new(),
            reasons: vec![format!(
                "Jev model decision: {} ({percent}% confidence, model: {})",
                self.raw_choice, self.model_name
            )],
            matched_rule: None,
        }
    }
}

/// Route through a host-provided Jev client without local heuristic fallback.
pub async fn route_with_jev<C: JevClient>(
    request: &RouteRequest,
    candidates: &[RouteCandidate],
    client: &C,
) -> Result<RouteDecision, JevError> {
    if candidates.is_empty() {
        return Err(JevError::NoCandidates);
    }

    let decision = client.decide(request, candidates).await?;
    Ok(decision.to_route_decision())
}
