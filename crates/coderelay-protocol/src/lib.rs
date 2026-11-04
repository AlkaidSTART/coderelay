//! Versioned protocol shared by CodeRelay hosts and external clients.
//!
//! The first transport is newline-delimited JSON over stdio. Requests and
//! responses carry a protocol version; run events use the same domain event
//! union as the desktop application and CLI.

use coderelay_core::{
    AgentEvent, AgentId, AgentRunResult, Config, DetectedCli, RouteRequest, RoutingMode,
    SessionRecord, SessionTurn,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: u32 = 1;

pub mod method {
    pub const STATUS: &str = "status";
    pub const DISCOVER_AGENTS: &str = "discoverAgents";
    pub const GET_MODEL_CATALOG: &str = "getModelCatalog";
    pub const ROUTE: &str = "route";
    pub const START_RUN: &str = "startRun";
    pub const CANCEL_RUN: &str = "cancelRun";
    pub const LIST_RECENT_WORKSPACES: &str = "listRecentWorkspaces";
    pub const LIST_SESSIONS: &str = "listSessions";
    pub const GET_SESSION: &str = "getSession";
    pub const READ_CONFIG: &str = "readConfig";
    pub const SAVE_CONFIG: &str = "saveConfig";
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestEnvelope {
    pub protocol_version: u32,
    pub request_id: String,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ResponseEnvelope {
    Ok {
        protocol_version: u32,
        request_id: String,
        result: Value,
    },
    Error {
        protocol_version: u32,
        request_id: String,
        error: ProtocolError,
    },
}

impl ResponseEnvelope {
    pub fn ok(request_id: impl Into<String>, result: Value) -> Self {
        Self::Ok {
            protocol_version: PROTOCOL_VERSION,
            request_id: request_id.into(),
            result,
        }
    }

    pub fn error(request_id: impl Into<String>, error: ProtocolError) -> Self {
        Self::Error {
            protocol_version: PROTOCOL_VERSION,
            request_id: request_id.into(),
            error,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolError {
    pub code: ErrorCode,
    pub message: String,
    pub retryable: bool,
}

impl ProtocolError {
    pub fn new(code: ErrorCode, message: impl Into<String>, retryable: bool) -> Self {
        Self {
            code,
            message: message.into(),
            retryable,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    InvalidRequest,
    UnsupportedVersion,
    NotFound,
    Conflict,
    HostUnavailable,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventEnvelope {
    pub protocol_version: u32,
    pub run_id: String,
    pub session_id: String,
    pub event: AgentEvent,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCompletedEnvelope {
    pub protocol_version: u32,
    pub run_id: String,
    pub session_id: String,
    pub result: AgentRunResult,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceParams {
    pub cwd: Option<String>,
    pub config_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResult {
    pub core_version: String,
    pub protocol_version: u32,
    pub transport: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverAgentsResult {
    pub cwd: String,
    pub config_path: Option<String>,
    pub default_agent: AgentId,
    pub routing_modes: Vec<RoutingMode>,
    pub detected: Vec<DetectedCli>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GetModelCatalogParams {
    #[serde(default)]
    pub workspace: WorkspaceParams,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteParams {
    #[serde(default)]
    pub workspace: WorkspaceParams,
    pub request: RouteRequest,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<RoutingMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteResult {
    pub agent: AgentId,
    pub model: Option<String>,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunParams {
    #[serde(default)]
    pub workspace: WorkspaceParams,
    pub request: RouteRequest,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<RoutingMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRunResult {
    pub run_id: String,
    pub session_id: String,
    pub agent: AgentId,
    pub model: Option<String>,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelRunParams {
    pub run_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelRunResult {
    pub cancelled: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ListRecentWorkspacesParams {
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ListSessionsParams {
    pub workspace: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSessionParams {
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetailResult {
    pub session: SessionRecord,
    pub turns: Vec<SessionTurn>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ReadConfigParams {
    #[serde(default)]
    pub workspace: WorkspaceParams,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSourceResult {
    pub path: String,
    pub exists: bool,
    pub raw: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigParams {
    #[serde(default)]
    pub workspace: WorkspaceParams,
    pub raw: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigResult {
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigResult {
    pub config: Config,
    pub path: Option<String>,
}

pub fn validate_protocol_version(version: u32) -> Result<(), ProtocolError> {
    if version == PROTOCOL_VERSION {
        return Ok(());
    }
    Err(ProtocolError::new(
        ErrorCode::UnsupportedVersion,
        format!("unsupported protocol version {version}; expected {PROTOCOL_VERSION}"),
        false,
    ))
}

/// Serialize one newline-delimited message.
pub fn encode_message<T: Serialize>(message: &T) -> Result<String, serde_json::Error> {
    serde_json::to_string(message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_round_trips_with_camel_case_fields() {
        let request = RequestEnvelope {
            protocol_version: PROTOCOL_VERSION,
            request_id: "req-1".to_owned(),
            method: method::DISCOVER_AGENTS.to_owned(),
            params: None,
        };
        let json = serde_json::to_string(&request).expect("serialize request");
        assert!(json.contains("\"protocolVersion\":1"));
        assert!(json.contains("\"requestId\":\"req-1\""));
        let decoded: RequestEnvelope = serde_json::from_str(&json).expect("deserialize request");
        assert_eq!(decoded, request);
    }

    #[test]
    fn unsupported_versions_are_rejected() {
        let error = validate_protocol_version(PROTOCOL_VERSION + 1)
            .expect_err("future protocol must be rejected");
        assert_eq!(error.code, ErrorCode::UnsupportedVersion);
        assert!(!error.retryable);
    }

    #[test]
    fn events_share_the_core_union() {
        let event = EventEnvelope {
            protocol_version: PROTOCOL_VERSION,
            run_id: "run-1".to_owned(),
            session_id: "session-1".to_owned(),
            event: AgentEvent::AssistantText {
                text: "hello".to_owned(),
            },
        };
        let json = serde_json::to_value(event).expect("serialize event");
        assert_eq!(json["event"]["kind"], "assistant_text");
        assert_eq!(json["event"]["text"], "hello");
    }

    #[test]
    fn typed_params_round_trip_non_empty_metadata() {
        let params = StartRunParams {
            workspace: WorkspaceParams {
                cwd: Some("/workspace".to_owned()),
                config_path: Some("/workspace/config.yaml".to_owned()),
            },
            request: RouteRequest {
                prompt: "fix tests".to_owned(),
                files: Some(vec!["src/lib.rs".to_owned()]),
                language: Some("rust".to_owned()),
                context_size: Some(42_000),
                required_strengths: None,
            },
            mode: Some(RoutingMode::Manual),
            agent: Some("codex".to_owned()),
            model: Some("gpt-5".to_owned()),
            timeout_ms: Some(5_000),
            session_id: Some("session-1".to_owned()),
        };
        let json = serde_json::to_value(&params).expect("serialize params");
        assert_eq!(json["workspace"]["cwd"], "/workspace");
        assert_eq!(json["request"]["contextSize"], 42_000);
        let decoded: StartRunParams = serde_json::from_value(json).expect("deserialize params");
        assert_eq!(decoded, params);
    }

    #[test]
    fn model_and_config_types_remain_typed() {
        let catalog = coderelay_core::ModelCatalog {
            probes: Vec::new(),
            options: Vec::new(),
        };
        let json = serde_json::to_value(catalog).expect("serialize catalog");
        assert!(json["options"].is_array());
    }
}
