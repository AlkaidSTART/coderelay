pub mod cli;
pub mod paths;
pub mod types;
pub mod version;
pub mod wsl;

pub use cli::{ScannerOptions, cli_version, resolve_on_path, scan_coding_clis};
pub use types::{
    CliCandidate, CliDefinition, CliDiagnostic, CliRuntime, CliSource, DetectedCli,
    DiagnosticLevel, LaunchTarget, cli_definitions, detect_host_agent,
};
pub use wsl::{
    DEFAULT_WSL_MOUNT_ROOT, WSL_EXECUTABLE, WslAutomountConfig, WslCliLocation, WslScanOptions,
    WslScanResult, build_wsl_args, decode_wsl_output, normalize_mount_root,
    parse_wsl_conf_automount, parse_wsl_distros, resolve_wsl_mount_root, scan_wsl_clis,
    to_windows_path, to_wsl_path,
};
