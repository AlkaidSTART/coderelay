import { Box, Text } from "ink";

import { theme } from "../theme";

export type HintContext =
  | "scanning"
  | "picker"
  | "chat"
  | "running"
  | "detail";

export interface HintBarProps {
  readonly context: HintContext;
}

interface Hint {
  readonly key: string;
  readonly label: string;
}

const HINTS: Readonly<
  Record<Exclude<HintContext, "scanning">, readonly Hint[]>
> = {
  picker: [
    { key: "←→", label: "移动" },
    { key: "↵", label: "选择" },
    { key: "q", label: "退出" },
  ],
  chat: [
    { key: "↵", label: "发送" },
    { key: "/model", label: "切换 agent" },
    { key: "tab", label: "交互模式" },
    { key: "esc", label: "选择 agent" },
  ],
  running: [{ key: "ctrl c", label: "中止任务" }],
  detail: [
    { key: "↵ / esc", label: "返回" },
    { key: "q", label: "退出" },
  ],
};

/** 底部键位条：常驻在窗口最后一行，不参与滚动内容。 */
export function HintBar({ context }: HintBarProps) {
  if (context === "scanning") {
    return (
      <Text color={theme.muted}>
        扫描完成后自动进入选择，稍等一下。
      </Text>
    );
  }

  return (
    <Box flexDirection="row">
      {HINTS[context].map((hint, index) => (
        <Text key={hint.key}>
          {index > 0 ? (
            <Text color={theme.muted}>
              {"  ·  "}
            </Text>
          ) : null}
          <Text bold>{hint.key}</Text>
          <Text color={theme.muted}>{` ${hint.label}`}</Text>
        </Text>
      ))}
    </Box>
  );
}
