use serde::{Deserialize, Serialize};

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
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[repr(u8)]
pub enum ModelCost {
    One = 1,
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5,
}
