use coderelay_core::{AgentDescriptor, CORE_VERSION, supported_agents};
use coderelay_protocol::PROTOCOL_VERSION;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStatus {
    core_version: &'static str,
    protocol_version: u32,
    transport: &'static str,
}

#[tauri::command]
fn runtime_status() -> RuntimeStatus {
    RuntimeStatus {
        core_version: CORE_VERSION,
        protocol_version: PROTOCOL_VERSION,
        transport: "in-process",
    }
}

#[tauri::command]
fn supported_agents() -> Vec<AgentDescriptor> {
    coderelay_core::supported_agents()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runtime_status, supported_agents])
        .run(tauri::generate_context!())
        .expect("error while running CodeRelay desktop");
}
