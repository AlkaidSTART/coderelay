import { ThemeProvider as InkThemeProvider } from "@inkjs/ui";
import { Box, Text, useInput, useWindowSize } from "ink";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import type { CliId, DetectedCli } from "../models/cli";
import type { SessionTurn } from "../models/session";
import type { ModelOption, ProbeDisplay } from "../agents/model-catalog";
import { inkTheme } from "./ink-theme";
import { theme } from "./theme";
import { AppHeader } from "./components/AppHeader";
import { ChatView } from "./components/ChatView";
import { CliList, cliDisplayName } from "./components/CliList";
import { HintBar, type HintContext } from "./components/HintBar";
import { ScanningView } from "./components/ScanningView";
import { StageBar, type Stage } from "./components/StageBar";
import {
  findSlashCommand,
  matchSlashCommands,
  SLASH_HELP,
} from "./slash-commands";

export type LaunchRequest =
  | { readonly id: CliId; readonly mode: "prompt"; readonly prompt: string }
  | { readonly id: CliId; readonly mode: "interactive" };

/** 统一执行状态机：idle/probing/selecting/starting/running/completed/failed/aborted。 */
export type AgentPhase =
  | "idle"
  | "probing"
  | "selecting"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "aborted";

/** 正在执行的任务：加载态与位置层都靠它回答「现在是谁在跑」。live* 为流式实时字段。 */
export interface RunningTask {
  readonly id: CliId;
  readonly prompt: string;
  readonly startedAt: number;
  readonly modelId?: string;
  readonly liveText?: string;
  readonly statusText?: string;
  readonly tool?: string;
}

/**  terminal 状态（completed/failed/aborted）的一次性展示。 */
export interface PhaseResult {
  readonly phase: "completed" | "failed" | "aborted";
  readonly message: string;
}

export interface AppProps {
  readonly clis: readonly DetectedCli[];
  readonly isScanning?: boolean;
  readonly initialId?: CliId;
  readonly turns?: readonly SessionTurn[];
  readonly running?: RunningTask | null;
  readonly onLaunch: (request: LaunchRequest) => void;
  readonly onAbort?: () => void;
  readonly onNewSession?: () => void;
  readonly onExit: () => void;
  /** 统一状态机（可选，缺省时由 running/screen 推导，保持旧调用兼容）。 */
  readonly phase?: AgentPhase;
  /** probing 阶段四 CLI 独立状态。 */
  readonly probes?: readonly ProbeDisplay[];
  /** selecting 阶段统一候选。 */
  readonly modelOptions?: readonly ModelOption[];
  /** selecting 阶段已选项下标（受控于调用方时传入）。 */
  readonly selectedModelIndex?: number;
  /** terminal 结果一次性展示。 */
  readonly lastResult?: PhaseResult | null;
  readonly onSelectModel?: (option: ModelOption) => void;
  readonly onCancelSelecting?: () => void;
  /** /model 统一模型选择器入口（提供时优先于旧 picker 屏）。 */
  readonly onRequestModelSelector?: () => void;
}

type Screen = "scanning" | "mode" | "picker" | "chat" | "detail";

function selectedIndexFor(clis: readonly DetectedCli[], initialId?: CliId): number {
  if (!initialId) {
    return 0;
  }

  const index = clis.findIndex((cli) => cli.id === initialId);
  return index >= 0 ? index : 0;
}

const MODES: readonly string[] = ["手动选择", "自动路由"];

function moveSelection(
  current: number,
  delta: number,
  length: number,
): number {
  if (length === 0) {
    return 0;
  }

  return (current + delta + length) % length;
}

function probeStatusText(probe: ProbeDisplay): string {
  switch (probe.status) {
    case "scanning":
      return "扫描中";
    case "found":
      return `已找到 ${probe.models.length} 个模型`;
    case "unprobed":
      return `无法探测${probe.reason ? `：${probe.reason}` : ""}`;
    case "not-installed":
      return "未安装";
    case "disabled":
      return `已禁用${probe.reason ? `：${probe.reason}` : ""}`;
  }
}

function capabilityTags(option: ModelOption): string {
  const tags: string[] = [];
  if (option.capabilities.structuredEvents) {
    tags.push("结构化");
  }
  if (option.capabilities.nativeResume) {
    tags.push("原生会话");
  }
  if (option.capabilities.toolEvents) {
    tags.push("工具事件");
  }
  return tags.length > 0 ? ` [${tags.join("|")}]` : "";
}

export function App({
  clis,
  isScanning = false,
  initialId,
  turns = [],
  running = null,
  onLaunch,
  onAbort,
  onNewSession,
  onExit,
  phase,
  probes,
  modelOptions,
  selectedModelIndex,
  lastResult,
  onSelectModel,
  onCancelSelecting,
  onRequestModelSelector,
}: AppProps) {
  const [screen, setScreen] = useState<Screen>(() => {
    if (isScanning) {
      return "scanning";
    }
    // 交互模式结束后重挂载：带着 initialId 直接回到对话区继续干活。
    return initialId ? "chat" : "mode";
  });
  const [selectedIndex, setSelectedIndex] = useState(() =>
    selectedIndexFor(clis, initialId),
  );
  const [modelCursor, setModelCursor] = useState(0);
  const effectivePhase: AgentPhase =
    phase ?? (running ? "running" : "idle");

  // 受控下标（调用方传入时同步），并钳制到候选范围内。
  useEffect(() => {
    if (selectedModelIndex !== undefined) {
      setModelCursor(selectedModelIndex);
    }
  }, [selectedModelIndex]);
  const optionCount = modelOptions?.length ?? 0;
  const clampedCursor =
    optionCount === 0
      ? 0
      : Math.min(Math.max(modelCursor, 0), optionCount - 1);
  const [modeIndex, setModeIndex] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // 备用屏里没有终端滚动条，根节点占满窗口，画面才会像全屏应用而不是命令输出。
  const { rows } = useWindowSize();

  useEffect(() => {
    if (isScanning) {
      setScreen("scanning");
      return;
    }

    setScreen((current) => current === "scanning" ? "mode" : current);
  }, [isScanning]);

  const selectedCli = clis[selectedIndex];
  const activeId = selectedCli?.id;

  useInput(
    (input, key) => {
      if ((key.ctrl && input === "c") || input === "q") {
        onExit();
        return;
      }

      if (key.leftArrow || input === "h") {
        setModeIndex((current) => moveSelection(current, -1, MODES.length));
        return;
      }

      if (key.rightArrow || input === "l") {
        setModeIndex((current) => moveSelection(current, 1, MODES.length));
        return;
      }

      if (!key.return) {
        return;
      }

      if (modeIndex !== 1) {
        setScreen("picker");
        return;
      }

      // 自动路由：根据任务并结合本机 CLI 自动选择合适的 CLI（当前先用首个可用直进对话）。
      const autoIndex = clis.findIndex((cli) => cli.available);
      if (autoIndex >= 0) {
        setSelectedIndex(autoIndex);
        const target = clis[autoIndex];
        setScreen(target && target.available ? "chat" : "detail");
      } else {
        setScreen("picker");
      }
    },
    { isActive: screen === "mode" },
  );

  useInput(
    (input, key) => {
      if ((key.ctrl && input === "c") || input === "q") {
        onExit();
        return;
      }

      if (key.leftArrow || input === "h") {
        setSelectedIndex((current) =>
          moveSelection(current, -1, clis.length),
        );
        return;
      }

      if (key.rightArrow || input === "l") {
        setSelectedIndex((current) =>
          moveSelection(current, 1, clis.length),
        );
        return;
      }

      if (!key.return || !selectedCli) {
        return;
      }

      setScreen(selectedCli.available ? "chat" : "detail");
    },
    { isActive: screen === "picker" },
  );

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        // running 时中止任务；空闲时退出整个接力台。
        if (running) {
          onAbort?.();
        } else {
          onExit();
        }
        return;
      }

      if (running) {
        // 任务执行中不响应导航，避免开出新任务。
        return;
      }

      if (key.escape) {
        if (effectivePhase === "selecting") {
          onCancelSelecting?.();
          return;
        }
        setScreen("picker");
        return;
      }

      if (key.tab && activeId) {
        onLaunch({ id: activeId, mode: "interactive" });
      }
    },
    { isActive: screen === "chat" },
  );

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        onCancelSelecting?.();
        return;
      }

      if (key.escape) {
        onCancelSelecting?.();
        return;
      }

      const options = modelOptions ?? [];
      if (options.length === 0) {
        return;
      }

      if (key.upArrow || input === "k") {
        setModelCursor(
          (current) => (current - 1 + options.length) % options.length,
        );
        return;
      }

      if (key.downArrow || input === "j") {
        setModelCursor((current) => (current + 1) % options.length);
        return;
      }

      if (key.return) {
        const option = options[clampedCursor];
        // 不可用候选不可提交：停留在选择器由用户另选。
        if (option?.available) {
          onSelectModel?.(option);
        }
      }
    },
    { isActive: effectivePhase === "selecting" },
  );

  useInput(
    (input, key) => {
      if ((key.ctrl && input === "c") || input === "q") {
        onExit();
        return;
      }

      if (key.return || key.escape) {
        setScreen("picker");
      }
    },
    { isActive: screen === "detail" },
  );

  // TextInput 的 onChange 走内部 effect 上报，回调身份参与依赖：
  // 必须保持稳定引用，否则每次重渲染都会把上一笔输入重复上报一次，
  // 迟到的 onChange 会带着 setNotice(null) 抹掉刚设置的提示。
  const handlePromptChange = useCallback((value: string): void => {
    setPrompt(value);
    setNotice(null);
  }, []);

  const handleSubmit = (value: string): void => {
    const normalized = value.trim();
    setPrompt("");
    setNotice(null);

    if (!normalized) {
      return;
    }

    if (normalized.startsWith("/")) {
      const matches = matchSlashCommands(normalized);
      if (matches.length === 1) {
        const command = matches[0];
        if (command?.name === "/model") {
          if (onRequestModelSelector) {
            onRequestModelSelector();
          } else {
            setScreen("picker");
          }
        } else if (command?.name === "/new") {
          onNewSession?.();
        } else if (command?.name === "/help") {
          setNotice(SLASH_HELP);
        }
      } else if (matches.length === 0) {
        setNotice("未知命令，输入 / 查看可用命令");
      } else {
        setNotice("命令不唯一，再输入几个字母");
      }
      return;
    }

    if (!running && activeId) {
      onLaunch({ id: activeId, mode: "prompt", prompt: normalized });
    }
  };

  const stage: Stage =
    screen === "scanning"
      ? "scan"
      : screen === "chat"
        ? running
          ? "run"
          : turns.length > 0
            ? "result"
            : "compose"
        : "select";
  const focusId = screen === "chat" && running ? running.id : activeId;

  let hint: HintContext = "picker";
  let body: ReactNode;

  const autoCli = clis.find((cli) => cli.available);

  if (screen === "scanning") {
    hint = "scanning";
    body = <ScanningView />;
  } else if (screen === "mode") {
    hint = "mode";
    body = (
      <Box flexDirection="column" paddingX={2}>
        <Box marginBottom={1}>
          <Text bold color={theme.text}>
            先选个开场方式？
          </Text>
        </Box>
        <Box flexDirection="row">
          {MODES.map((label, index) => {
            const active = index === modeIndex;
            const underlineWidth = label.length;
            return (
              <Box
                key={label}
                flexDirection="column"
                marginRight={index < MODES.length - 1 ? 3 : 0}
              >
                <Text bold={active} color={active ? theme.text : theme.muted}>
                  {label}
                </Text>
                <Text color={theme.accent}>
                  {active
                    ? "─".repeat(underlineWidth)
                    : " ".repeat(underlineWidth)}
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1} height={1}>
          <Text color={theme.muted} wrap="truncate-end">
            {modeIndex === 1
              ? autoCli
                ? "根据任务并结合本机 CLI 自动选择合适的 CLI"
                : "暂无可用 CLI，先手动看看"
              : "自己挑用哪个 CLI 干活"}
          </Text>
        </Box>
      </Box>
    );
  } else if (screen === "chat" && activeId) {
    hint = running ? "running" : "chat";
    const phaseBanner: ReactNode =
      effectivePhase === "probing" && probes ? (
        <Box flexDirection="column" paddingX={2} marginBottom={1}>
          <Text bold color={theme.text}>
            正在探测本机模型…
          </Text>
          {probes.map((probe) => (
            <Text key={probe.cliId} color={theme.muted}>
              {cliDisplayName(probe.cliId)}：{probeStatusText(probe)}
            </Text>
          ))}
        </Box>
      ) : effectivePhase === "selecting" && modelOptions ? (
        <Box flexDirection="column" paddingX={2} marginBottom={1}>
          <Text bold color={theme.text}>
            选择 CLI + 模型（↑↓ 移动，Enter 确认，Esc 取消）
          </Text>
          {modelOptions.map((option, index) => {
            const cursor = index === clampedCursor;
            const marker = cursor ? "❯" : " ";
            const state = option.available
              ? ""
              : `（不可用${option.reason ? `：${option.reason}` : ""}）`;
            return (
              <Text
                key={`${option.cliId}:${option.modelId}`}
                bold={cursor}
                color={
                  option.available
                    ? cursor
                      ? theme.text
                      : theme.muted
                    : theme.muted
                }
              >
                {marker} {cliDisplayName(option.cliId)}:{option.modelId}{" "}
                {option.label}
                {option.isDefault ? " [默认]" : ""}
                {capabilityTags(option)}
                {state}
              </Text>
            );
          })}
        </Box>
      ) : effectivePhase === "starting" && running ? (
        <Box paddingX={2} marginBottom={1}>
          <Text bold color={theme.text}>
            正在启动 {cliDisplayName(running.id)}
            {running.modelId ? `:${running.modelId}` : ""}…
          </Text>
        </Box>
      ) : lastResult ? (
        <Box paddingX={2} marginBottom={1}>
          <Text
            color={
              lastResult.phase === "completed"
                ? theme.ok
                : lastResult.phase === "aborted"
                  ? theme.muted
                  : theme.alert
            }
          >
            {lastResult.message}
          </Text>
        </Box>
      ) : null;
    body = (
      <Box flexDirection="column">
        {phaseBanner}
        <ChatView
        agentName={cliDisplayName(activeId)}
        turns={turns}
        running={
          running
            ? {
                agentName: cliDisplayName(running.id),
                prompt: running.prompt,
                startedAt: running.startedAt,
                modelId: running.modelId,
                liveText: running.liveText,
                statusText: running.statusText,
                tool: running.tool,
              }
            : null
        }
        prompt={prompt}
        notice={notice}
        commands={matchSlashCommands(prompt)}
        onChange={handlePromptChange}
        onSubmit={handleSubmit}
        />
      </Box>
    );
  } else if (screen === "detail" && selectedCli) {
    hint = "detail";
    body = (
      <Box flexDirection="column" paddingX={2}>
        <Text bold color={theme.text}>
          {cliDisplayName(selectedCli.id)} 还没就位
        </Text>
        <Text color={theme.muted}>PATH 里找不到 {selectedCli.bin}。</Text>
        <Text color={theme.muted}>
          安装后重新运行 coderelay，它会出现在这里。
        </Text>
      </Box>
    );
  } else {
    body = <CliList clis={clis} selectedIndex={selectedIndex} />;
  }

  return (
    <InkThemeProvider theme={inkTheme}>
      {/* 不铺底色：底色交给终端原生背景。Ink 只给有字符的格子刷底，
          整屏铺 backgroundColor 会在空行和行尾漏出终端底色。 */}
      <Box width="100%" minHeight={rows} flexDirection="column">
        <AppHeader />
        <StageBar
          stage={stage}
          focus={focusId ? cliDisplayName(focusId) : undefined}
          focusNote={screen === "detail" ? "未安装" : undefined}
        />
        <Box flexDirection="column" marginTop={1}>{body}</Box>
        {/* 弹簧把键位条顶到窗口最后一行，画面因此始终铺满整屏。 */}
        <Box flexGrow={1} />
        <Box paddingX={2} marginTop={1}>
          <HintBar context={hint} />
        </Box>
      </Box>
    </InkThemeProvider>
  );
}
