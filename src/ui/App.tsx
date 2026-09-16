import { ThemeProvider as InkThemeProvider } from "@inkjs/ui";
import { Box, Text, useInput, useWindowSize } from "ink";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import type { CliId, DetectedCli } from "../models/cli";
import type { SessionTurn } from "../models/session";
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

/** 正在执行的任务：加载态与位置层都靠它回答「现在是谁在跑」。 */
export interface RunningTask {
  readonly id: CliId;
  readonly prompt: string;
  readonly startedAt: number;
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
}

type Screen = "scanning" | "picker" | "chat" | "detail";

function selectedIndexFor(clis: readonly DetectedCli[], initialId?: CliId): number {
  if (!initialId) {
    return 0;
  }

  const index = clis.findIndex((cli) => cli.id === initialId);
  return index >= 0 ? index : 0;
}

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
}: AppProps) {
  const [screen, setScreen] = useState<Screen>(() => {
    if (isScanning) {
      return "scanning";
    }
    // 交互模式结束后重挂载：带着 initialId 直接回到对话区继续干活。
    return initialId ? "chat" : "picker";
  });
  const [selectedIndex, setSelectedIndex] = useState(() =>
    selectedIndexFor(clis, initialId),
  );
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // 备用屏里没有终端滚动条，根节点占满窗口，画面才会像全屏应用而不是命令输出。
  const { rows } = useWindowSize();

  useEffect(() => {
    if (isScanning) {
      setScreen("scanning");
      return;
    }

    setScreen((current) => current === "scanning" ? "picker" : current);
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
          setScreen("picker");
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

  if (screen === "scanning") {
    hint = "scanning";
    body = <ScanningView />;
  } else if (screen === "chat" && activeId) {
    hint = running ? "running" : "chat";
    body = (
      <ChatView
        agentName={cliDisplayName(activeId)}
        turns={turns}
        running={
          running
            ? {
                agentName: cliDisplayName(running.id),
                prompt: running.prompt,
                startedAt: running.startedAt,
              }
            : null
        }
        prompt={prompt}
        notice={notice}
        commands={matchSlashCommands(prompt)}
        onChange={handlePromptChange}
        onSubmit={handleSubmit}
      />
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
