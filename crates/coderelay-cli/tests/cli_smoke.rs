use std::process::Command;

use coderelay_core::{AgentDescriptor, AgentId};

#[test]
fn agents_json_returns_non_empty_machine_readable_catalog() {
    let output = Command::new(env!("CARGO_BIN_EXE_coderelay"))
        .args(["agents", "--json"])
        .output()
        .expect("run coderelay agents --json");

    assert!(output.status.success());
    let agents: Vec<AgentDescriptor> =
        serde_json::from_slice(&output.stdout).expect("parse agent descriptors");
    assert_eq!(agents.len(), 4);
    assert_eq!(agents[0].id, AgentId::Codex);
    assert_eq!(agents[1].binary, "claude");
}

#[test]
fn doctor_reports_protocol_version() {
    let output = Command::new(env!("CARGO_BIN_EXE_coderelay"))
        .args(["doctor", "--json"])
        .output()
        .expect("run coderelay doctor --json");

    assert!(output.status.success());
    let report: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("parse doctor report");
    assert_eq!(report["protocolVersion"], 1);
    assert_eq!(report["status"], "scaffold");
}
