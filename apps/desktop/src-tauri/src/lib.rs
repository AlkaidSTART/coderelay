use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use coderelay_cli::commands::{AgentListEntry, build_agent_entries};
use coderelay_cli::context::{CliContext, RunSelection, load_context};
use coderelay_cli::jev::JevHttpClient;
use coderelay_core::router::jev;
use coderelay_core::{
    AgentAbortHandle, AgentEvent, AgentRunOptions, AgentRunResult, CORE_VERSION, ModelCatalog,
    ROUTING_MODES, RouteRequest, RoutingMode, start_agent_run,
};
use coderelay_protocol::PROTOCOL_VERSION;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

const RUN_EVENT: &str = "run-event";
const RUN_COMPLETED: &str = "run-completed";

#[derive(Default)]
struct DesktopState {
    runs: Mutex<HashMap<String, AgentAbortHandle>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStatus {
    core_version: &'static str,
    protocol_version: u32,
    transport: &'static str,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct WorkspaceRequest {
    cwd: Option<String>,
    config_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveryPayload {
    cwd: String,
    config_path: Option<String>,
    default_agent: coderelay_core::AgentId,
    routing_modes: Vec<RoutingMode>,
    agents: Vec<AgentListEntry>,
    catalog: ModelCatalog,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectionRequest {
    #[serde(default)]
    workspace: WorkspaceRequest,
    request: RouteRequest,
    mode: Option<RoutingMode>,
    agent: Option<String>,
    model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RoutePreview {
    agent: coderelay_core::AgentId,
    model: Option<String>,
    reasons: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartRunRequest {
    #[serde(default)]
    workspace: WorkspaceRequest,
    request: RouteRequest,
    mode: Option<RoutingMode>,
    agent: Option<String>,
    model: Option<String>,
    timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartRunResponse {
    run_id: String,
    agent: coderelay_core::AgentId,
    model: Option<String>,
    reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunEventPayload {
    run_id: String,
    event: AgentEvent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RunCompletedPayload {
    run_id: String,
    result: AgentRunResult,
}

#[tauri::command]
fn runtime_status() -> RuntimeStatus {
    RuntimeStatus {
        core_version: CORE_VERSION,
        protocol_version: PROTOCOL_VERSION,
        transport: "in-process",
    }
}

fn workspace_paths(request: &WorkspaceRequest) -> (Option<PathBuf>, Option<PathBuf>) {
    (
        request.cwd.as_ref().map(PathBuf::from),
        request.config_path.as_ref().map(PathBuf::from),
    )
}

async fn context_for(request: &WorkspaceRequest) -> Result<CliContext, String> {
    let (cwd, config_path) = workspace_paths(request);
    tauri::async_runtime::spawn_blocking(move || {
        load_context(cwd.as_deref(), config_path.as_deref()).map_err(|error| format!("{error:#}"))
    })
    .await
    .map_err(|error| format!("context task failed: {error}"))?
}

#[tauri::command]
async fn discover(request: WorkspaceRequest) -> Result<DiscoveryPayload, String> {
    let context = context_for(&request).await?;
    Ok(DiscoveryPayload {
        cwd: context.cwd.to_string_lossy().into_owned(),
        config_path: context
            .loaded_config
            .path
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        default_agent: context.config().default_agent,
        routing_modes: ROUTING_MODES.to_vec(),
        agents: build_agent_entries(&context),
        catalog: context.catalog.clone(),
    })
}

async fn select_for(
    context: &CliContext,
    request: &SelectionRequest,
) -> Result<RunSelection, String> {
    if request.agent.is_some() || request.model.is_some() {
        return context
            .select(
                &request.request,
                request.agent.as_deref(),
                request.model.as_deref(),
                request.mode,
            )
            .map_err(|error| format!("{error:#}"));
    }

    match request.mode.unwrap_or(context.config().routing.mode) {
        RoutingMode::Jev => {
            let candidates = context.route_candidates();
            if candidates.is_empty() {
                return Err("没有可用的已探测模型".to_owned());
            }
            let client =
                JevHttpClient::from_config(context.config(), &context.cwd, &context.environment)
                    .await
                    .map_err(|error| error.to_string())?;
            let decision = jev::route_with_jev(&request.request, &candidates, &client)
                .await
                .map_err(|error| error.to_string())?;
            Ok(RunSelection {
                agent: decision.agent,
                model: decision.model,
                candidate: Some(decision.candidate),
                reasons: decision.reasons,
            })
        }
        mode => context
            .select(&request.request, None, None, Some(mode))
            .map_err(|error| format!("{error:#}")),
    }
}

#[tauri::command]
async fn route_preview(request: SelectionRequest) -> Result<RoutePreview, String> {
    let context = context_for(&request.workspace).await?;
    let selection = select_for(&context, &request).await?;
    Ok(RoutePreview {
        agent: selection.agent,
        model: selection.model,
        reasons: selection.reasons,
    })
}

#[tauri::command]
async fn start_run(app: AppHandle, request: StartRunRequest) -> Result<StartRunResponse, String> {
    let context = context_for(&request.workspace).await?;
    let selection_request = SelectionRequest {
        workspace: request.workspace.clone(),
        request: request.request.clone(),
        mode: request.mode,
        agent: request.agent.clone(),
        model: request.model.clone(),
    };
    let selection = select_for(&context, &selection_request).await?;
    let prepared = context
        .prepare_agent(
            selection.agent,
            selection.model.clone(),
            &request.request.prompt,
        )
        .map_err(|error| format!("{error:#}"))?;

    let mut options = AgentRunOptions::new(prepared.command);
    options.cwd = prepared.cwd;
    options.environment = prepared.environment;
    options.timeout = request.timeout_ms.map(std::time::Duration::from_millis);
    options.protocol = if prepared.structured {
        coderelay_core::AgentProtocol::Structured
    } else {
        coderelay_core::AgentProtocol::Text
    };
    options.target = Some(prepared.target);
    let handle = start_agent_run(options);
    let run_id = handle.run_id.clone();
    let abort_handle = handle.abort_handle();
    app.state::<DesktopState>()
        .runs
        .lock()
        .map_err(|_| "run registry lock poisoned".to_owned())?
        .insert(run_id.clone(), abort_handle);

    let response = StartRunResponse {
        run_id: run_id.clone(),
        agent: selection.agent,
        model: selection.model,
        reasons: selection.reasons,
    };
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut handle = handle;
        while let Some(event) = handle.events.recv().await {
            let _ = app_handle.emit(
                RUN_EVENT,
                RunEventPayload {
                    run_id: run_id.clone(),
                    event,
                },
            );
        }
        match handle.done.await {
            Ok(result) => {
                let _ = app_handle.emit(
                    RUN_COMPLETED,
                    RunCompletedPayload {
                        run_id: run_id.clone(),
                        result,
                    },
                );
            }
            Err(error) => {
                let _ = app_handle.emit(
                    RUN_COMPLETED,
                    RunCompletedPayload {
                        run_id: run_id.clone(),
                        result: AgentRunResult {
                            status: coderelay_core::AgentRunStatus::SpawnError,
                            code: None,
                            signal: None,
                            duration_ms: 0,
                            timed_out: false,
                            text: String::new(),
                            stderr_tail: error.to_string(),
                            events: Vec::new(),
                        },
                    },
                );
            }
        }
        if let Ok(mut runs) = app_handle.state::<DesktopState>().runs.lock() {
            runs.remove(&run_id);
        }
    });

    Ok(response)
}

#[tauri::command]
fn cancel_run(app: AppHandle, run_id: String) -> Result<bool, String> {
    let state: State<'_, DesktopState> = app.state();
    let runs = state
        .runs
        .lock()
        .map_err(|_| "run registry lock poisoned".to_owned())?;
    if let Some(handle) = runs.get(&run_id) {
        handle.abort();
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn supported_agents() -> Vec<coderelay_core::AgentDescriptor> {
    coderelay_core::supported_agents()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DesktopState::default())
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            supported_agents,
            discover,
            route_preview,
            start_run,
            cancel_run
        ])
        .run(tauri::generate_context!())
        .expect("error while running CodeRelay desktop");
}
