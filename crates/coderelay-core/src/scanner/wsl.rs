use std::collections::BTreeMap;
use std::time::Duration;

use crate::agent::AgentId;
use crate::host::{CommandRunner, ExecOutput, ExecRequest};
use crate::scanner::types::{CliDiagnostic, DiagnosticLevel};
use crate::scanner::version::probe_version;

pub const WSL_EXECUTABLE: &str = "wsl.exe";
pub const DEFAULT_WSL_MOUNT_ROOT: &str = "/mnt";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslAutomountConfig {
    pub enabled: bool,
    pub root: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslCliLocation {
    pub distro: String,
    pub path: String,
    pub version: Option<String>,
    pub mount_root: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WslScanResult {
    pub detected: bool,
    pub distros: Vec<String>,
    pub locations: BTreeMap<AgentId, Vec<WslCliLocation>>,
    pub diagnostics: Vec<CliDiagnostic>,
}

#[derive(Debug, Clone)]
pub struct WslScanOptions {
    pub resolve_timeout: Duration,
    pub version_timeout: Duration,
    pub version_args: Vec<Vec<String>>,
    pub wsl_bin: String,
    pub mount_root: Option<String>,
    pub env: BTreeMap<String, String>,
}

pub fn normalize_mount_root(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return DEFAULT_WSL_MOUNT_ROOT.to_owned();
    }
    if trimmed == "/" {
        return "/".to_owned();
    }
    format!("/{}", trimmed.trim_matches('/'))
}

pub fn parse_wsl_conf_automount(content: &str) -> WslAutomountConfig {
    let mut enabled = true;
    let mut root = DEFAULT_WSL_MOUNT_ROOT.to_owned();
    let mut in_automount = false;

    for line in content.lines() {
        let line = line.split('#').next().unwrap_or_default().trim();
        if line.starts_with('[') && line.ends_with(']') {
            in_automount = line.eq_ignore_ascii_case("[automount]");
            continue;
        }
        if !in_automount {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim().trim_matches(['"', '\'']);
        match key.as_str() {
            "enabled" => {
                enabled = !matches!(value.to_ascii_lowercase().as_str(), "false" | "no" | "0");
            }
            "root" => root = normalize_mount_root(value),
            _ => {}
        }
    }

    WslAutomountConfig { enabled, root }
}

pub fn resolve_wsl_mount_root(
    explicit: Option<&str>,
    env: &BTreeMap<String, String>,
) -> Option<String> {
    if let Some(explicit) = explicit {
        return Some(normalize_mount_root(explicit));
    }
    env.get("WSL_AUTOMOUNT_ROOT")
        .or_else(|| env.get("WSL_MOUNT_ROOT"))
        .map(|value| normalize_mount_root(value))
        .or_else(|| Some(DEFAULT_WSL_MOUNT_ROOT.to_owned()))
}

pub fn build_wsl_args(distro: Option<&str>, command_args: &[String]) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(distro) = distro {
        args.push("-d".to_owned());
        args.push(distro.to_owned());
    }
    args.push("--".to_owned());
    args.extend(command_args.iter().cloned());
    args
}

pub fn to_wsl_path(windows_path: &str, mount_root: Option<&str>) -> Option<String> {
    let value = windows_path.trim();
    if value.is_empty() {
        return None;
    }
    if value.starts_with('/') {
        return Some(value.to_owned());
    }
    if value.starts_with("\\\\") {
        return None;
    }

    let mut chars = value.chars();
    let drive = chars.next()?.to_ascii_lowercase();
    if !drive.is_ascii_alphabetic() || chars.next()? != ':' {
        return None;
    }
    let rest = chars.as_str().trim_start_matches(['\\', '/']);
    let root = normalize_mount_root(mount_root.unwrap_or(DEFAULT_WSL_MOUNT_ROOT));
    let prefix = if root == "/" {
        format!("/{drive}")
    } else {
        format!("{root}/{drive}")
    };
    if rest.is_empty() {
        Some(prefix)
    } else {
        Some(
            format!("{prefix}/{rest}")
                .replace('\\', "/")
                .replace("//", "/"),
        )
    }
}

pub fn to_windows_path(wsl_path: &str, mount_root: Option<&str>) -> Option<String> {
    let value = wsl_path.trim().replace('\\', "/");
    let root = normalize_mount_root(mount_root.unwrap_or(DEFAULT_WSL_MOUNT_ROOT));
    let relative = if root == "/" {
        value.trim_start_matches('/')
    } else {
        value.strip_prefix(&format!("{root}/"))?
    };
    let mut parts = relative.splitn(2, '/');
    let drive = parts.next()?.to_ascii_uppercase();
    if drive.len() != 1 || !drive.chars().next()?.is_ascii_alphabetic() {
        return None;
    }
    let rest = parts.next().unwrap_or_default().replace('/', "\\");
    Some(if rest.is_empty() {
        format!("{drive}:\\")
    } else {
        format!("{drive}:\\{rest}")
    })
}

pub fn decode_wsl_output(text: &str) -> String {
    text.replace('\0', "")
}

pub fn parse_wsl_distros(stdout: &str) -> Vec<String> {
    decode_wsl_output(stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

fn exec_wsl(
    runner: &dyn CommandRunner,
    wsl_bin: &str,
    args: Vec<String>,
    timeout: Duration,
    env: &BTreeMap<String, String>,
) -> Result<ExecOutput, crate::host::CommandError> {
    runner.exec(
        &ExecRequest::new(wsl_bin, args)
            .with_timeout(timeout)
            .with_env(env.clone()),
    )
}

fn locate_in_distro(
    runner: &dyn CommandRunner,
    options: &WslScanOptions,
    distro: &str,
    bin: &str,
) -> Option<String> {
    let args = build_wsl_args(
        Some(distro),
        &[
            "sh".to_owned(),
            "-lc".to_owned(),
            format!("command -v {bin}"),
        ],
    );
    let output = exec_wsl(
        runner,
        &options.wsl_bin,
        args,
        options.resolve_timeout,
        &options.env,
    )
    .ok()?;
    decode_wsl_output(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_owned)
}

pub fn scan_wsl_clis(runner: &dyn CommandRunner, options: &WslScanOptions) -> WslScanResult {
    let mut diagnostics = Vec::new();
    let distros_output = exec_wsl(
        runner,
        &options.wsl_bin,
        vec!["-l".to_owned(), "-q".to_owned()],
        options.resolve_timeout,
        &options.env,
    );

    let stdout = match distros_output {
        Ok(output) => output.stdout,
        Err(error) => {
            diagnostics.push(CliDiagnostic {
                level: DiagnosticLevel::Info,
                message: format!("WSL 不可用（{} -l -q 失败）：{error}", options.wsl_bin),
            });
            return WslScanResult {
                detected: false,
                distros: Vec::new(),
                locations: BTreeMap::new(),
                diagnostics,
            };
        }
    };

    let distros = parse_wsl_distros(&stdout);
    if distros.is_empty() {
        diagnostics.push(CliDiagnostic {
            level: DiagnosticLevel::Info,
            message: "已检测到 wsl.exe，但未安装任何 WSL 发行版。".to_owned(),
        });
        return WslScanResult {
            detected: false,
            distros,
            locations: BTreeMap::new(),
            diagnostics,
        };
    }

    let mount_root = resolve_wsl_mount_root(options.mount_root.as_deref(), &options.env)
        .unwrap_or_else(|| DEFAULT_WSL_MOUNT_ROOT.to_owned());
    let mut locations: BTreeMap<AgentId, Vec<WslCliLocation>> = BTreeMap::new();

    for distro in &distros {
        for definition in crate::scanner::types::cli_definitions() {
            let Some(linux_path) = locate_in_distro(runner, options, distro, &definition.bin)
            else {
                continue;
            };
            let mut prefix = vec![options.wsl_bin.clone()];
            prefix.extend(build_wsl_args(
                Some(distro),
                std::slice::from_ref(&linux_path),
            ));
            let version = probe_version(
                runner,
                &prefix,
                options.version_timeout,
                &options.version_args,
                &options.env,
            );
            locations
                .entry(definition.id)
                .or_default()
                .push(WslCliLocation {
                    distro: distro.clone(),
                    path: linux_path,
                    version,
                    mount_root: mount_root.clone(),
                });
        }
    }

    WslScanResult {
        detected: true,
        distros,
        locations,
        diagnostics,
    }
}
