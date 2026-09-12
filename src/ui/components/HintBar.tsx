import { Text } from "ink";

import { theme } from "../theme";

export type HintContext = "picker" | "composer" | "detail" | "result";

export interface HintBarProps {
  readonly context: HintContext;
}

const HINTS: Readonly<Record<HintContext, string>> = {
  picker: "⌨ ↑↓ / kj 移动   ↵ 选择   q 退出",
  composer: "⌨ ↵ 执行任务   tab 纯交互   esc 返回",
  detail: "⌨ ↵ / esc 返回   q 退出",
  result: "⌨ ↵ / esc 返回选择   q 退出",
};

export function HintBar({ context }: HintBarProps) {
  return (
    <Text color={theme.dim} wrap="truncate-end">
      {HINTS[context]}
    </Text>
  );
}
