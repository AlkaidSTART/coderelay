//! Versioned protocol shared by CodeRelay hosts and external clients.
//!
//! The first transport target is newline-delimited JSON over stdio. The same
//! envelopes can later be carried by a daemon without changing domain types.

use coderelay_core::AgentDescriptor;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "camelCase")]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolError {
    pub code: ErrorCode,
    pub message: String,
    pub retryable: bool,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestEnvelope {
    pub protocol_version: u32,
    pub request_id: String,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventEnvelope {
    pub protocol_version: u32,
    pub run_id: String,
    pub event: RunEvent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RunEvent {
    RunStarted {
        agent: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    AssistantText {
        text: String,
    },
    Completed {
        text: String,
        exit_code: i32,
    },
    Failed {
        message: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        exit_code: Option<i32>,
    },
    Aborted {
        reason: String,
    },
}

pub fn validate_protocol_version(version: u32) -> Result<(), ProtocolError> {
    if version == PROTOCOL_VERSION {
        return Ok(());
    }

    Err(ProtocolError {
        code: ErrorCode::UnsupportedVersion,
        message: format!("unsupported protocol version {version}; expected {PROTOCOL_VERSION}"),
        retryable: false,
    })
}

/// A stable response payload for the first scaffold command.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverAgentsResult {
    pub agents: Vec<AgentDescriptor>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_round_trips_with_camel_case_fields() {
        let request = RequestEnvelope {
            protocol_version: PROTOCOL_VERSION,
            request_id: "req-1".to_owned(),
            method: "discoverAgents".to_owned(),
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
    fn run_events_use_stable_kind_tags() {
        let event = EventEnvelope {
            protocol_version: PROTOCOL_VERSION,
            run_id: "run-1".to_owned(),
            event: RunEvent::AssistantText {
                text: "hello".to_owned(),
            },
        };
        let json = serde_json::to_value(event).expect("serialize event");
        assert_eq!(json["event"]["kind"], "assistantText");
        assert_eq!(json["event"]["text"], "hello");
    }
}
