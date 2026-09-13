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
}
