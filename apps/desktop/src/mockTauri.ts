import type {
  AgentEntry,
  ConfigSource,
  DiscoveryPayload,
  JevSettings,
  ModelOption,
  RoutePreview,
  RuntimeStatus,
  SessionDetail,
  SessionRecord,
  StartRunResponse,
} from "./types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: (
        cmd: string,
        args?: Record<string, unknown>,
        options?: unknown,
      ) => Promise<unknown>;
    };
  }
}

const mockCatalogOptions: ModelOption[] = [
  {
    cliId: "codex",
    modelId: "qwen-3.8-flash",
    label: "Qwen 3.8 Flash",
    description: "极致低延迟与高吞吐的快速响应模型",
    isDefault: true,
    isNativeDefault: true,
    capabilities: {
      structuredEvents: true,
      nativeResume: true,
      nonInteractivePrompt: true,
      explicitModel: true,
      toolEvents: true,
    },
    strengths: ["fast", "chat"],
    cost: 0.001,
    contextWindow: 128000,
    available: true,
  },
  {
    cliId: "codex",
    modelId: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    description: "深度推理与高质量代码生成",
    isDefault: false,
    isNativeDefault: false,
    capabilities: {
      structuredEvents: true,
      nativeResume: true,
      nonInteractivePrompt: true,
      explicitModel: true,
      toolEvents: true,
    },
    strengths: ["reasoning", "coding"],
    cost: 0.002,
    contextWindow: 64000,
    available: true,
  },
  {
    cliId: "claude",
    modelId: "claude-3-7-sonnet",
    label: "Claude 3.7 Sonnet",
    description: "前沿架构设计与长上下文混合推理",
    isDefault: true,
    isNativeDefault: true,
    capabilities: {
      structuredEvents: true,
      nativeResume: true,
      nonInteractivePrompt: true,
      explicitModel: true,
      toolEvents: true,
    },
    strengths: ["architecture", "reasoning", "refactor"],
    cost: 0.015,
    contextWindow: 200000,
    available: true,
  },
  {
    cliId: "claude",
    modelId: "claude-3-5-haiku",
    label: "Claude 3.5 Haiku",
    description: "快速轻量的指令执行与单步修复",
    isDefault: false,
    isNativeDefault: false,
    capabilities: {
      structuredEvents: true,
      nativeResume: true,
      nonInteractivePrompt: true,
      explicitModel: true,
      toolEvents: true,
    },
    strengths: ["fast", "scripts"],
    cost: 0.003,
    contextWindow: 200000,
    available: true,
  },
];

const mockAgents: AgentEntry[] = [
  {
    id: "codex",
    label: "Codex CLI",
    enabled: true,
    isDefault: true,
    available: true,
    command: "codex",
    path: "/usr/local/bin/codex",
    version: "0.9.1",
    models: ["qwen-3.8-flash", "deepseek-v4-flash"],
    runtime: "local",
    source: "path",
    candidates: [
      {
        path: "/usr/local/bin/codex",
        runtime: "local",
        source: "path",
        version: "0.9.1",
      },
    ],
    diagnostics: [],
  },
  {
    id: "claude",
    label: "Claude Code",
    enabled: true,
    isDefault: false,
    available: true,
    command: "claude",
    path: "/usr/local/bin/claude",
    version: "1.0.2",
    models: ["claude-3-7-sonnet", "claude-3-5-haiku"],
    runtime: "local",
    source: "path",
    candidates: [
      {
        path: "/usr/local/bin/claude",
        runtime: "local",
        source: "path",
        version: "1.0.2",
      },
    ],
    diagnostics: [],
  },
];

const defaultSessionRecord: SessionRecord = {
  id: "sess-default",
  cliId: "codex",
  title: "CodeRelay 控制平面初始化",
  createdAt: 1729999999000,
  updatedAt: 1730000000000,
  workspace: "/Users/allure/Desktop/coderelay",
};

const mockSessions: SessionRecord[] = [
  defaultSessionRecord,
  {
    id: "sess-001",
    cliId: "claude",
    title: "设计三级联动智能路由 (Mode / Agent / Model)",
    createdAt: Date.now() - 3600000 * 2,
    updatedAt: Date.now() - 1800000,
    workspace: "/Users/allure/Desktop/coderelay",
  },
  {
    id: "sess-002",
    cliId: "codex",
    title: "迁移 ThemePreset 系统并补齐极夜暗黑配色",
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 43200000,
    workspace: "/Users/allure/Desktop/coderelay",
  },
  {
    id: "sess-003",
    cliId: "claude",
    title: "优化本地 SQLite 会话存储与跨工作区索引性能",
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000,
    workspace: "/Users/allure/Desktop/coderelay",
  },
];

const mockDiscovery: DiscoveryPayload = {
  cwd: "/Users/allure/Desktop/coderelay",
  configPath: "/Users/allure/Desktop/coderelay/.coderelay/config.yaml",
  defaultAgent: "codex",
  routingModes: ["auto", "cost", "performance", "manual"],
  agents: mockAgents,
  catalog: {
    probes: [
      {
        cliId: "codex",
        status: "ok",
        models: mockCatalogOptions.filter((o) => o.cliId === "codex"),
      },
      {
        cliId: "claude",
        status: "ok",
        models: mockCatalogOptions.filter((o) => o.cliId === "claude"),
      },
    ],
    options: mockCatalogOptions,
  },
  recentWorkspaces: [
    "/Users/allure/Desktop/coderelay",
    "/Users/allure/Projects/agent-workspace",
    "/Users/allure/Code/kernel-optimizer",
  ],
};

const mockRuntime: RuntimeStatus = {
  coreVersion: "0.4.4",
  protocolVersion: 1,
  transport: "browser-preview",
};

const mockConfigSource: ConfigSource = {
  path: "/Users/allure/Desktop/coderelay/.coderelay/config.yaml",
  exists: true,
  raw: `# CodeRelay 本地配置文件
defaultAgent: "codex"
defaultMode: "auto"
models:
  - id: "qwen-3.8-flash"
    strengths: ["fast", "chat"]
  - id: "claude-3-7-sonnet"
    strengths: ["architecture", "reasoning"]
`,
};

let jevSettingsState: JevSettings = {
  stored: true,
  environmentConfigured: false,
};

let sessionsState: SessionRecord[] = [...mockSessions];

export async function mockInvoke(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  switch (cmd) {
    case "runtime_status":
      return mockRuntime;
    case "discover":
      return {
        ...mockDiscovery,
        cwd: typeof args.cwd === "string" && args.cwd.trim() ? args.cwd : mockDiscovery.cwd,
      };
    case "list_sessions":
      return sessionsState;
    case "list_recent_workspaces":
      return mockDiscovery.recentWorkspaces;
    case "get_session": {
      const sessionId = typeof args.sessionId === "string" ? args.sessionId : "";
      const found =
        sessionsState.find((s) => s.id === sessionId) ??
        sessionsState[0] ??
        defaultSessionRecord;
      const detail: SessionDetail = {
        session: found,
        turns: [
          {
            id: 1,
            sessionId: found.id,
            cliId: found.cliId,
            prompt: found.title,
            output: `已通过 ${found.cliId} 完成任务分析：\n\n1. 扫描当前工作区结构\n2. 校验配置定义与单一数据源约束\n3. 单元测试全量通过 (392 pass)`,
            exitCode: 0,
            signal: null,
            durationMs: 1420,
            createdAt: found.createdAt,
            modelId: found.cliId === "codex" ? "qwen-3.8-flash" : "claude-3-7-sonnet",
            protocol: "structured",
            reusedNative: false,
            status: "success",
            eventSummary: "执行成功，用时 1.42s",
          },
        ],
      };
      return detail;
    }
    case "delete_session": {
      const sessionId = typeof args.sessionId === "string" ? args.sessionId : "";
      sessionsState = sessionsState.filter((s) => s.id !== sessionId);
      return true;
    }
    case "delete_workspace_sessions": {
      sessionsState = [];
      return 1;
    }
    case "read_config_source":
      return mockConfigSource;
    case "save_config":
      return mockConfigSource.path;
    case "get_jev_settings":
      return jevSettingsState;
    case "save_jev_api_key":
      jevSettingsState = { ...jevSettingsState, stored: true };
      return jevSettingsState;
    case "clear_jev_api_key":
      jevSettingsState = { ...jevSettingsState, stored: false };
      return jevSettingsState;
    case "route_preview": {
      const preview: RoutePreview = {
        agent: "codex",
        model: "qwen-3.8-flash",
        reasons: ["根据提示词长度与复杂度自适应推荐", "极低延迟模型，优先吞吐"],
      };
      return preview;
    }
    case "start_run": {
      const resp: StartRunResponse = {
        runId: `run-${Date.now()}`,
        sessionId: `sess-${Date.now()}`,
        agent: "codex",
        model: "qwen-3.8-flash",
        reasons: ["自适应路由成功匹配"],
      };
      return resp;
    }
    case "cancel_run":
      return true;
    case "pick_workspace":
      return "/Users/allure/Desktop/coderelay";
    default:
      console.warn(`[mockTauri] Unhandled command: ${cmd}`);
      return null;
  }
}

if (typeof window !== "undefined" && !window.__TAURI_INTERNALS__) {
  window.__TAURI_INTERNALS__ = {
    invoke: (cmd: string, args?: Record<string, unknown>) =>
      mockInvoke(cmd, args ?? {}),
  };
}
