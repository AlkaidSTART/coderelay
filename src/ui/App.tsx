import { Box, Text, useInput } from "ink";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import type { CliId, DetectedCli } from "../models/cli";
import { theme } from "./theme";
import { AppHeader } from "./components/AppHeader";
import { CliList, cliDisplayName } from "./components/CliList";
import { HintBar, type HintContext } from "./components/HintBar";
import { PromptField } from "./components/PromptField";
import { ScanningView } from "./components/ScanningView";
import { SessionResult } from "./components/SessionResult";

export type LaunchRequest =
  | { readonly id: CliId; readonly mode: "prompt"; readonly prompt: string }
  | { readonly id: CliId; readonly mode: "interactive" };

export interface SessionOutcome {
  readonly id: CliId;
  readonly code: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
}

export interface AppProps {
  readonly clis: readonly DetectedCli[];
  readonly isScanning?: boolean;
  readonly initialId?: CliId;
  readonly session?: SessionOutcome | null;
  readonly onLaunch: (request: LaunchRequest) => void;
  readonly onExit: () => void;
}

type Screen = "scanning" | "picker" | "composer" | "detail" | "result";

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
  session = null,
  onLaunch,
  onExit,
}: AppProps) {
  const [screen, setScreen] = useState<Screen>(() => {
    if (isScanning) {
      return "scanning";
    }
    return session ? "result" : "picker";
  });
  const [selectedIndex, setSelectedIndex] = useState(() =>
    selectedIndexFor(clis, initialId),
  );
  const [prompt, setPrompt] = useState("");

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

      if (key.upArrow || input === "k") {
        setSelectedIndex((current) =>
          moveSelection(current, -1, clis.length),
        );
        return;
      }

      if (key.downArrow || input === "j") {
        setSelectedIndex((current) =>
          moveSelection(current, 1, clis.length),
        );
        return;
      }

      if (!key.return || !selectedCli) {
        return;
      }

      setScreen(selectedCli.available ? "composer" : "detail");
    },
    { isActive: screen === "picker" },
  );

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        onExit();
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
    { isActive: screen === "composer" },
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
    { isActive: screen === "result" },
  );

  let hint: HintContext = "picker";
  let body: ReactNode;

  if (screen === "scanning") {
    body = <ScanningView />;
  } else if (screen === "composer" && activeId) {
    hint = "composer";
    body = (
      <Box flexDirection="column">
        <Box paddingX={2}>
          <Text color={theme.muted}>
            将任务交给 {cliDisplayName(activeId)}
          </Text>
        </Box>
        <PromptField
          value={prompt}
          onChange={setPrompt}
          onSubmit={(value) => {
            const normalized = value.trim();
            if (normalized) {
              onLaunch({ id: activeId, mode: "prompt", prompt: normalized });
            }
          }}
          isFocused
        />
      </Box>
    );
  } else if (screen === "detail" && selectedCli) {
    hint = "detail";
    body = (
      <Box flexDirection="column" paddingX={2}>
        <Text color={theme.text}>
          未检测到 {cliDisplayName(selectedCli.id)}
        </Text>
        <Text color={theme.muted}>
          请先安装 {selectedCli.bin}，并确保它已加入 PATH。
        </Text>
        <Text color={theme.dim}>安装后重新运行 coderelay 即可扫描。</Text>
      </Box>
    );
  } else if (screen === "result" && session) {
    hint = "result";
    body = <SessionResult session={session} />;
  } else {
    body = <CliList clis={clis} selectedIndex={selectedIndex} />;
  }

  return (
    <Box flexDirection="column">
      <AppHeader />
      {body}
      <Box paddingX={2} marginTop={1}>
        <HintBar context={hint} />
      </Box>
    </Box>
  );
}
