export interface RuntimeStatus {
  coreVersion: string;
  protocolVersion: number;
  transport: string;
}

export interface CliCandidate {
  path: string;
  runtime: string;
  source: string;
  distro?: string;
  mountRoot?: string;
  version: string | null;
}

export interface CliDiagnostic {
  level: string;
  message: string;
}

export interface AgentEntry {
  id: string;
  label: string;
  enabled: boolean;
  isDefault: boolean;
  available: boolean;
  command: string;
  path: string;
  version: string | null;
  models: string[];
  runtime: string;
  distro?: string;
  source: string;
  candidates: CliCandidate[];
  diagnostics: CliDiagnostic[];
}

export interface CliCapabilities {
  structuredEvents: boolean;
  nativeResume: boolean;
  nonInteractivePrompt: boolean;
  explicitModel: boolean;
  toolEvents: boolean;
}

export interface ModelOption {
  cliId: string;
  modelId: string;
  label: string;
  description?: string;
  isDefault: boolean;
  isNativeDefault?: boolean;
  capabilities: CliCapabilities;
  strengths: string[];
  cost?: number;
  contextWindow?: number;
  available: boolean;
  reason?: string;
}

export interface ProbeDisplay {
  cliId: string;
  status: string;
  models: ModelOption[];
  reason?: string;
}

export interface ModelCatalog {
  probes: ProbeDisplay[];
  options: ModelOption[];
}

export interface DiscoveryPayload {
  cwd: string;
  configPath: string | null;
  defaultAgent: string;
  routingModes: string[];
  agents: AgentEntry[];
  catalog: ModelCatalog;
  recentWorkspaces: string[];
}

export interface RouteRequest {
  prompt: string;
  files?: string[];
  language?: string;
  contextSize?: number;
  requiredStrengths?: string[];
}

export interface WorkspaceRequest {
  cwd?: string;
  configPath?: string;
}

export interface RoutePreview {
  agent: string;
  model?: string;
  reasons: string[];
}

export interface AgentEvent {
  kind: string;
  text?: string;
  tool?: string;
  reason?: string;
  message?: string;
  exitCode?: number | null;
}

export interface AgentRunResult {
  status: string;
  code: number | null;
  signal: string | null;
  durationMs: number;
  timedOut: boolean;
  text: string;
  stderrTail: string;
  events: AgentEvent[];
}

export interface StartRunResponse {
  runId: string;
  sessionId: string;
  agent: string;
  model?: string;
  reasons: string[];
}

export interface RunEventPayload {
  runId: string;
  sessionId: string;
  event: AgentEvent;
}

export interface RunCompletedPayload {
  runId: string;
  sessionId: string;
  result: AgentRunResult;
}

export interface SessionRecord {
  id: string;
  cliId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspace?: string;
}

export interface SessionTurn {
  id: number;
  sessionId: string;
  cliId: string;
  prompt: string;
  output: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  createdAt: number;
  modelId?: string;
  protocol?: string;
  reusedNative?: boolean;
  status?: string;
  eventSummary?: string;
  contextSource?: string;
}

export interface SessionDetail {
  session: SessionRecord;
  turns: SessionTurn[];
}

export interface ConfigSource {
  path: string;
  exists: boolean;
  raw: string;
}

export interface SessionUpdatedPayload {
  sessionId: string;
  turnId: number | null;
}
