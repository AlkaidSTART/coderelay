pub mod catalog;
pub mod probes;
pub mod types;

pub use catalog::{
    TargetSelection, compare_targets, probe_model_catalog, to_route_candidates,
    validate_explicit_target,
};
pub use probes::{
    ClaudeModelProbe, CodexModelProbe, ModelProbe, ModelProbeRegistry, ModelProbeRoots,
    OmpModelProbe, PiModelProbe, create_model_probes,
};
pub use types::{
    CliCapabilities, ModelCatalog, ModelOption, ProbeDisplay, ProbeDisplayStatus, ProbeResult,
    ProbedModel, capabilities_for,
};
