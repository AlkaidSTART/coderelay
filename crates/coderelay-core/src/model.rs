use serde::{Deserialize, Deserializer, Serialize, Serializer, de};

use crate::agent::{AgentId, InvalidAgentId};

/// Capabilities used by deterministic routing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModelStrength {
    Coding,
    Reasoning,
    LongContext,
    ToolUse,
    Fast,
    Cheap,
    Creative,
    Multimodal,
}

impl ModelStrength {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Coding => "coding",
            Self::Reasoning => "reasoning",
            Self::LongContext => "long-context",
            Self::ToolUse => "tool-use",
            Self::Fast => "fast",
            Self::Cheap => "cheap",
            Self::Creative => "creative",
            Self::Multimodal => "multimodal",
        }
    }
}

/// All legal routing strengths. Consumers must use this collection rather than
/// maintaining their own string lists.
pub const MODEL_STRENGTHS: [ModelStrength; 8] = [
    ModelStrength::Coding,
    ModelStrength::Reasoning,
    ModelStrength::LongContext,
    ModelStrength::ToolUse,
    ModelStrength::Fast,
    ModelStrength::Cheap,
    ModelStrength::Creative,
    ModelStrength::Multimodal,
];

/// Relative model cost, from one (cheapest) to five.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u8)]
pub enum ModelCost {
    One = 1,
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5,
}

impl TryFrom<u8> for ModelCost {
    type Error = String;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::One),
            2 => Ok(Self::Two),
            3 => Ok(Self::Three),
            4 => Ok(Self::Four),
            5 => Ok(Self::Five),
            other => Err(format!("cost must be between 1 and 5, got {other}")),
        }
    }
}

impl From<ModelCost> for u8 {
    fn from(value: ModelCost) -> Self {
        value as Self
    }
}

impl Serialize for ModelCost {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u8((*self).into())
    }
}

impl<'de> Deserialize<'de> for ModelCost {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = u8::deserialize(deserializer)?;
        Self::try_from(value).map_err(de::Error::custom)
    }
}

/// One model configured for an agent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ModelConfig {
    pub id: String,
    pub label: Option<String>,
    pub strengths: Vec<ModelStrength>,
    pub description: Option<String>,
    pub context_window: Option<u64>,
    pub cost: Option<ModelCost>,
    pub default: Option<bool>,
}

/// Parsed `agent:model` reference.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelRef {
    pub agent: Option<AgentId>,
    pub model: String,
}

/// Parse a model reference without silently accepting an unknown agent.
pub fn parse_model_ref(
    value: &str,
    default_agent: AgentId,
) -> Result<AgentModelRef, InvalidAgentId> {
    let trimmed = value.trim();
    let separator = trimmed.find(':');

    if separator.is_none_or(|index| index == 0) {
        return Ok(AgentModelRef {
            agent: Some(default_agent),
            model: trimmed.to_owned(),
        });
    }

    let index = separator.expect("separator checked above");
    let agent = trimmed[..index].parse::<AgentId>()?;
    Ok(AgentModelRef {
        agent: Some(agent),
        model: trimmed[index + 1..].trim().to_owned(),
    })
}

pub fn format_model_ref(agent: AgentId, model: &str) -> String {
    format!("{agent}:{model}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_costs_round_trip_as_numbers() {
        let yaml = serde_norway::to_string(&ModelCost::Five).expect("serialize cost");
        assert_eq!(yaml.trim(), "5");
        let decoded: ModelCost = serde_norway::from_str("3").expect("deserialize cost");
        assert_eq!(decoded, ModelCost::Three);
    }

    #[test]
    fn model_reference_keeps_colons_in_the_model_id() {
        let reference =
            parse_model_ref("pi:openrouter:model", AgentId::Codex).expect("parse model reference");
        assert_eq!(reference.agent, Some(AgentId::Pi));
        assert_eq!(reference.model, "openrouter:model");
    }

    #[test]
    fn bare_model_reference_uses_the_default_agent() {
        let reference = parse_model_ref("gpt-5", AgentId::Codex).expect("parse model reference");
        assert_eq!(reference.agent, Some(AgentId::Codex));
        assert_eq!(reference.model, "gpt-5");
    }
}
