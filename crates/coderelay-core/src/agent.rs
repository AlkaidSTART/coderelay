use serde::{Deserialize, Serialize};

/// Supported coding-agent CLIs.
///
/// Keep this enum as the single source of truth for agent identity. Exhaustive
/// matching ensures new agents cannot silently bypass host integration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentId {
    Codex,
    Claude,
    Pi,
    Omp,
}

impl AgentId {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::Pi => "pi",
            Self::Omp => "omp",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDescriptor {
    pub id: AgentId,
    pub binary: String,
    pub display_name: String,
}

struct BuiltInAgent {
    id: AgentId,
    binary: &'static str,
    display_name: &'static str,
}

/// Canonical built-in agent catalog.
const BUILT_IN_AGENTS: [BuiltInAgent; 4] = [
    BuiltInAgent {
        id: AgentId::Codex,
        binary: "codex",
        display_name: "Codex CLI",
    },
    BuiltInAgent {
        id: AgentId::Claude,
        binary: "claude",
        display_name: "Claude Code",
    },
    BuiltInAgent {
        id: AgentId::Pi,
        binary: "pi",
        display_name: "Pi",
    },
    BuiltInAgent {
        id: AgentId::Omp,
        binary: "omp",
        display_name: "OMP",
    },
];

/// Return the canonical agent catalog in stable display order.
pub fn supported_agents() -> Vec<AgentDescriptor> {
    BUILT_IN_AGENTS
        .iter()
        .map(|agent| AgentDescriptor {
            id: agent.id,
            binary: agent.binary.to_owned(),
            display_name: agent.display_name.to_owned(),
        })
        .collect()
}

/// Iterate agent identifiers from the same canonical catalog.
pub fn agent_ids() -> impl Iterator<Item = AgentId> {
    BUILT_IN_AGENTS.iter().map(|agent| agent.id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_ids_serialize_as_lowercase_strings() {
        let json = serde_json::to_vec(&AgentId::Claude).expect("serialize agent id");
        assert_eq!(String::from_utf8(json).expect("utf8"), "\"claude\"");
    }

    #[test]
    fn descriptors_use_camel_case_fields() {
        let descriptor = &supported_agents()[0];
        let json = serde_json::to_value(descriptor).expect("serialize descriptor");
        assert_eq!(json["displayName"], "Codex CLI");
        assert_eq!(json["binary"], "codex");
    }
}
