use std::collections::BTreeMap;
use std::time::Duration;

use crate::host::{CommandRunner, ExecRequest};

pub fn first_non_empty_line(value: &str) -> Option<String> {
    value
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_owned)
}

/// Try documented version flags in order. A failure never fails the scan.
pub fn probe_version(
    runner: &dyn CommandRunner,
    prefix: &[String],
    timeout: Duration,
    version_args: &[Vec<String>],
    env: &BTreeMap<String, String>,
) -> Option<String> {
    let (file, base_args) = prefix.split_first()?;

    for version_flag in version_args {
        let args: Vec<String> = base_args
            .iter()
            .chain(version_flag.iter())
            .cloned()
            .collect();
        let request = ExecRequest::new(file.clone(), args)
            .with_timeout(timeout)
            .with_env(env.clone());
        if let Ok(output) = runner.exec(&request) {
            let source = if output.stdout.trim().is_empty() {
                output.stderr
            } else {
                output.stdout
            };
            if let Some(version) = first_non_empty_line(&source) {
                return Some(version);
            }
        }
    }

    None
}
