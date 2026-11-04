use serde::{Deserialize, Serialize};

use crate::agent::AgentId;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub cli_id: AgentId,
    pub title: String,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TurnRunStatus {
    Completed,
    Failed,
    Timeout,
    Aborted,
    SpawnError,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TurnContextSource {
    Native,
    Transcript,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TurnProtocol {
    Structured,
    Text,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTurn {
    pub id: i64,
    pub session_id: String,
    pub cli_id: AgentId,
    pub prompt: String,
    pub output: String,
    pub exit_code: Option<i32>,
    pub signal: Option<String>,
    pub duration_ms: u64,
    pub created_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protocol: Option<TurnProtocol>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reused_native: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<TurnRunStatus>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_source: Option<TurnContextSource>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppendTurnInput {
    pub session_id: String,
    pub cli_id: AgentId,
    pub prompt: String,
    pub output: String,
    pub exit_code: Option<i32>,
    pub signal: Option<String>,
    pub duration_ms: u64,
    pub model_id: Option<String>,
    pub protocol: Option<TurnProtocol>,
    pub reused_native: Option<bool>,
    pub status: Option<TurnRunStatus>,
    pub event_summary: Option<String>,
    pub context_source: Option<TurnContextSource>,
}

impl AppendTurnInput {
    pub fn new(
        session_id: impl Into<String>,
        cli_id: AgentId,
        prompt: impl Into<String>,
        output: impl Into<String>,
        exit_code: Option<i32>,
        duration_ms: u64,
    ) -> Self {
        Self {
            session_id: session_id.into(),
            cli_id,
            prompt: prompt.into(),
            output: output.into(),
            exit_code,
            signal: None,
            duration_ms,
            model_id: None,
            protocol: None,
            reused_native: None,
            status: None,
            event_summary: None,
            context_source: None,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ListSessionsOptions {
    pub workspace: Option<String>,
    pub limit: Option<u32>,
}
