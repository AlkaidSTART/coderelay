use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tempfile::TempDir;

fn binary() -> &'static str {
    env!("CARGO_BIN_EXE_coderelay")
}

fn isolated_command(home: &Path) -> Command {
    let mut command = Command::new(binary());
    command.env("CODERELAY_HOME", home);
    command
}

#[test]
fn agents_json_returns_all_canonical_agents() {
    let output = Command::new(binary())
        .args(["agents", "--json"])
        .output()
        .expect("run coderelay agents --json");

    assert!(output.status.success());
    let agents: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("parse agent entries");
    assert_eq!(agents.as_array().expect("array").len(), 4);
    assert_eq!(agents[0]["id"], "codex");
    assert_eq!(agents[1]["id"], "claude");
    assert!(agents[0].get("available").is_some());
    assert!(agents[0].get("candidates").is_some());
}

#[test]
fn models_json_exposes_probe_and_option_collections() {
    let output = Command::new(binary())
        .args(["models", "--json"])
        .output()
        .expect("run coderelay models --json");

    assert!(output.status.success());
    let catalog: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("parse model catalog");
    assert!(catalog["probes"].is_array());
    assert!(catalog["options"].is_array());
}

#[test]
fn doctor_json_reports_core_protocol_and_checks() {
    let output = Command::new(binary())
        .args(["doctor", "--json"])
        .output()
        .expect("run coderelay doctor --json");

    assert!(matches!(output.status.code(), Some(0) | Some(1)));
    let report: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("parse doctor report");
    assert_eq!(report["coreVersion"], "0.3.2");
    assert_eq!(report["protocolVersion"], 1);
    assert!(
        report["checks"]
            .as_array()
            .is_some_and(|checks| !checks.is_empty())
    );
    assert!(report["ok"].is_boolean());
}

#[test]
fn favorite_persists_and_clears_the_agent() {
    let dir = TempDir::new().expect("temp dir");
    let set = isolated_command(dir.path())
        .args(["favorite", "pi", "--json"])
        .output()
        .expect("set favorite");
    assert!(set.status.success());
    let set_body: serde_json::Value =
        serde_json::from_slice(&set.stdout).expect("favorite response");
    assert_eq!(set_body["favoriteAgent"], "pi");
    assert_eq!(set_body["changed"], true);

    let get = isolated_command(dir.path())
        .args(["favorite", "--json"])
        .output()
        .expect("get favorite");
    assert!(get.status.success());
    let get_body: serde_json::Value =
        serde_json::from_slice(&get.stdout).expect("favorite response");
    assert_eq!(get_body["favoriteAgent"], "pi");
    assert_eq!(get_body["changed"], false);

    let clear = isolated_command(dir.path())
        .args(["favorite", "clear", "--json"])
        .output()
        .expect("clear favorite");
    assert!(clear.status.success());
    let clear_body: serde_json::Value =
        serde_json::from_slice(&clear.stdout).expect("favorite response");
    assert!(clear_body["favoriteAgent"].is_null());
}

#[cfg(unix)]
#[test]
fn run_executes_a_configured_agent_with_explicit_model() {
    use std::os::unix::fs::PermissionsExt;

    let dir = TempDir::new().expect("temp dir");
    let workspace = dir.path().join("workspace");
    let codex_home = dir.path().join("fixture-codex");
    let home = dir.path().join("home");
    fs::create_dir_all(&workspace).expect("workspace");
    fs::create_dir_all(&codex_home).expect("codex home");
    fs::create_dir_all(&home).expect("home");

    let executable = dir.path().join("mock-codex");
    fs::write(&executable, "#!/bin/sh\nprintf 'fixture:%s\\n' \"$*\"\n").expect("write executable");
    let mut permissions = fs::metadata(&executable).expect("metadata").permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&executable, permissions).expect("chmod");

    fs::write(
        codex_home.join("config.toml"),
        "model = \"test-model\"\nmodel_catalog_json = \"models_cache.json\"\n",
    )
    .expect("codex config");
    fs::write(
        codex_home.join("models_cache.json"),
        r#"{"models":[{"slug":"test-model","display_name":"Test Model"}]}"#,
    )
    .expect("models cache");

    let config_path = dir.path().join("config.yaml");
    fs::write(
        &config_path,
        format!(
            r#"
defaultAgent: codex
agents:
  codex:
    command: {}
    models:
      - id: test-model
        strengths: [fast, coding]
routing:
  mode: manual
"#,
            executable.display()
        ),
    )
    .expect("config");

    let output = isolated_command(&home)
        .env("CODEX_HOME", &codex_home)
        .args([
            "run",
            "--config",
            config_path.to_str().expect("config path"),
            "--cwd",
            workspace.to_str().expect("workspace"),
            "--agent",
            "codex",
            "--model",
            "test-model",
            "hello fixture",
        ])
        .output()
        .expect("run coderelay");

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("fixture:exec --model test-model hello fixture"));
}

#[cfg(unix)]
#[test]
fn run_manual_mode_without_target_exits_one() {
    let dir = TempDir::new().expect("temp dir");
    let home = dir.path().join("home");
    fs::create_dir_all(&home).expect("home");
    let config_path = dir.path().join("config.yaml");
    fs::write(
        &config_path,
        "defaultAgent: codex\nrouting:\n  mode: manual\n",
    )
    .expect("config");

    let output = isolated_command(&home)
        .args([
            "run",
            "--config",
            PathBuf::from(&config_path).to_str().expect("config path"),
            "hello",
        ])
        .output()
        .expect("run coderelay");

    assert_eq!(output.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&output.stderr).contains("必须显式提供"));
}

#[cfg(unix)]
#[test]
fn run_timeout_uses_exit_code_124() {
    use std::os::unix::fs::PermissionsExt;

    let dir = TempDir::new().expect("temp dir");
    let workspace = dir.path().join("workspace");
    let codex_home = dir.path().join("fixture-codex");
    let home = dir.path().join("home");
    fs::create_dir_all(&workspace).expect("workspace");
    fs::create_dir_all(&codex_home).expect("codex home");
    fs::create_dir_all(&home).expect("home");

    let executable = dir.path().join("slow-codex");
    fs::write(
        &executable,
        "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo fixture-1.0; exit 0; fi\nsleep 5\n",
    )
    .expect("write executable");
    let mut permissions = fs::metadata(&executable).expect("metadata").permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&executable, permissions).expect("chmod");

    fs::write(
        codex_home.join("config.toml"),
        "model = \"test-model\"\nmodel_catalog_json = \"models_cache.json\"\n",
    )
    .expect("codex config");
    fs::write(
        codex_home.join("models_cache.json"),
        r#"{"models":[{"slug":"test-model"}]}"#,
    )
    .expect("models cache");

    let config_path = dir.path().join("config.yaml");
    fs::write(
        &config_path,
        format!(
            r#"
defaultAgent: codex
agents:
  codex:
    command: {}
    models:
      - id: test-model
        strengths: [fast]
routing:
  mode: manual
"#,
            executable.display()
        ),
    )
    .expect("config");

    let output = isolated_command(&home)
        .env("CODEX_HOME", &codex_home)
        .args([
            "run",
            "--config",
            config_path.to_str().expect("config path"),
            "--cwd",
            workspace.to_str().expect("workspace"),
            "--agent",
            "codex",
            "--model",
            "test-model",
            "--timeout",
            "100",
            "timeout fixture",
        ])
        .output()
        .expect("run coderelay");

    assert_eq!(output.status.code(), Some(124));
}

#[test]
fn sdk_host_serves_versioned_ndjson() {
    use std::io::Write;
    use std::process::Stdio;

    let mut child = Command::new(binary())
        .arg("sdk")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn sdk host");
    {
        let stdin = child.stdin.as_mut().expect("stdin");
        writeln!(
            stdin,
            "{}",
            serde_json::json!({
                "protocolVersion": 1,
                "requestId": "status-1",
                "method": "status"
            })
        )
        .expect("write status request");
        writeln!(
            stdin,
            "{}",
            serde_json::json!({
                "protocolVersion": 999,
                "requestId": "status-2",
                "method": "status"
            })
        )
        .expect("write invalid version");
    }
    drop(child.stdin.take());
    let output = child.wait_with_output().expect("host output");
    assert!(output.status.success());
    let lines: Vec<serde_json::Value> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| serde_json::from_str(line).expect("json line"))
        .collect();
    assert_eq!(lines.len(), 2);
    let valid = lines
        .iter()
        .find(|line| line["requestId"] == "status-1")
        .expect("valid response");
    assert_eq!(valid["status"], "ok");
    assert_eq!(valid["protocolVersion"], 1);
    assert_eq!(valid["result"]["transport"], "stdio");
    let invalid = lines
        .iter()
        .find(|line| line["requestId"] == "status-2")
        .expect("invalid response");
    assert_eq!(invalid["status"], "error");
    assert_eq!(invalid["error"]["code"], "unsupportedVersion");
}
