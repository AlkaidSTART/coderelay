//! Platform-neutral CodeRelay domain core.
//!
//! This crate deliberately does not depend on Tauri, a terminal framework, or
//! a specific operating system. Host applications provide filesystem,
//! process, and persistence adapters.

pub mod agent;
pub mod config;
pub mod model;
pub mod router;

pub use agent::{AgentDescriptor, AgentId, agent_ids, supported_agents};
pub use config::{
    Config, ConfigError, LoadConfigOptions, LoadedConfig, default_config, load_config,
    parse_config_yaml,
};
pub use model::{
    AgentModelRef, MODEL_STRENGTHS, ModelConfig, ModelCost, ModelStrength, format_model_ref,
    parse_model_ref,
};
pub use router::{
    RouteCandidate, RouteDecision, RouteError, RouteOptions, RouteRequest, RouteStrategy,
    RoutingMode, RoutingStrategy, RuleMatch, ScoredCandidate, build_route_candidates,
    has_ambiguous_route, resolve_routing_mode, route, select_candidate,
};

/// Semantic version of the Rust core crate.
pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn built_in_agents_are_non_empty_and_unique() {
        let agents = supported_agents();
        assert!(!agents.is_empty());

        let unique: HashSet<_> = agents.iter().map(|agent| agent.id).collect();
        assert_eq!(unique.len(), agents.len());
        assert_eq!(agent_ids().count(), agents.len());
    }

    #[test]
    fn core_version_matches_workspace_version() {
        assert_eq!(CORE_VERSION, "0.3.2");
    }
}
