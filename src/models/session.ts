import type { CliId } from "./cli";

/** One relay conversation, shared across CLIs; persisted in SQLite. */
export interface SessionRecord {
  readonly id: string;
  /** The CLI that started the session. */
  readonly cliId: CliId;
  /** Short title derived from the first prompt. */
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** 统一运行元数据：只追加可选字段，保持旧会话/旧测试兼容。 */
export type TurnRunStatus = "completed" | "failed" | "timeout" | "aborted" | "spawn-error";

/** 上下文来源：原生会话复用 vs transcript 注入。 */
export type TurnContextSource = "native" | "transcript" | "none";

/** One prompt/answer exchange inside a session. */
export interface SessionTurn {
  readonly id: number;
  readonly sessionId: string;
  /** The CLI that produced this turn; sessions may span multiple CLIs. */
  readonly cliId: CliId;
  readonly prompt: string;
  readonly output: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly createdAt: number;
  /** 选中的模型 id（未指定时为 undefined）。 */
  readonly modelId?: string;
  /** 是否使用结构化协议。 */
  readonly protocol?: "structured" | "text";
  /** 是否复用了原生 CLI 会话。 */
  readonly reusedNative?: boolean;
  /** 统一终止状态。 */
  readonly status?: TurnRunStatus;
  /** 最终事件流摘要（summarizeEvents 截断文本）。 */
  readonly eventSummary?: string;
  /** 上下文来源标记，用于 UI 展示。 */
  readonly contextSource?: TurnContextSource;
}
