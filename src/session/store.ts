import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { Database } from "bun:sqlite";

import { configDirFor } from "../config/loader";
import { CLI_IDS, type CliId } from "../models/cli";
import type {
  SessionRecord,
  SessionTurn,
  TurnContextSource,
  TurnRunStatus,
} from "../models/session";

export interface AppendTurnInput {
  readonly sessionId: string;
  readonly cliId: CliId;
  readonly prompt: string;
  readonly output: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly modelId?: string;
  readonly protocol?: "structured" | "text";
  readonly reusedNative?: boolean;
  readonly status?: TurnRunStatus;
  readonly eventSummary?: string;
  readonly contextSource?: TurnContextSource;
}

export interface SessionStore {
  createSession(cliId: CliId, title: string): SessionRecord;
  getSession(id: string): SessionRecord | null;
  listTurns(sessionId: string): readonly SessionTurn[];
  appendTurn(input: AppendTurnInput): SessionTurn;
  pruneSessions(keep: number): number;
  getPreference(key: string): string | null;
  setPreference(key: string, value: string): void;
  deletePreference(key: string): void;
  getFavoriteAgent(): CliId | null;
  setFavoriteAgent(cliId: CliId): void;
  clearFavoriteAgent(): void;
  close(): void;
}

interface SessionRow {
  readonly id: string;
  readonly cli_id: string;
  readonly title: string;
  readonly created_at: number;
  readonly updated_at: number;
}

interface TurnRow {
  readonly id: number;
  readonly session_id: string;
  readonly cli_id: string;
  readonly prompt: string;
  readonly output: string;
  readonly exit_code: number | null;
  readonly signal: string | null;
  readonly duration_ms: number;
  readonly created_at: number;
  readonly model_id?: string | null;
  readonly protocol?: string | null;
  readonly reused_native?: number | null;
  readonly status?: string | null;
  readonly event_summary?: string | null;
  readonly context_source?: string | null;
}

const SESSION_COLUMNS =
  "id, cli_id, title, created_at, updated_at";
const TURN_COLUMNS =
  "id, session_id, cli_id, prompt, output, exit_code, signal, duration_ms, created_at, model_id, protocol, reused_native, status, event_summary, context_source";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  cli_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  cli_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  output TEXT NOT NULL DEFAULT '',
  exit_code INTEGER,
  signal TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, id);
CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export const SESSION_RETENTION = 20;

/** Session database lives beside the config so history follows the repo. */
export function defaultSessionDbPath(cwd = process.cwd()): string {
  return join(configDirFor(cwd), "sessions.db");
}

function rowToSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    cliId: row.cli_id as CliId,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asTurnStatus(value: string | null | undefined): TurnRunStatus | undefined {
  return value === "completed" ||
    value === "failed" ||
    value === "timeout" ||
    value === "aborted" ||
    value === "spawn-error"
    ? value
    : undefined;
}

function asContextSource(value: string | null | undefined): TurnContextSource | undefined {
  return value === "native" || value === "transcript" || value === "none"
    ? value
    : undefined;
}

function rowToTurn(row: TurnRow): SessionTurn {
  return {
    id: row.id,
    sessionId: row.session_id,
    cliId: row.cli_id as CliId,
    prompt: row.prompt,
    output: row.output,
    exitCode: row.exit_code,
    signal: row.signal,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    modelId: row.model_id ?? undefined,
    protocol: row.protocol === "structured" || row.protocol === "text" ? row.protocol : undefined,
    reusedNative: row.reused_native === null || row.reused_native === undefined
      ? undefined
      : row.reused_native === 1,
    status: asTurnStatus(row.status),
    eventSummary: row.event_summary ?? undefined,
    contextSource: asContextSource(row.context_source),
  };
}

const TURN_MIGRATIONS: readonly string[] = [
  "ALTER TABLE turns ADD COLUMN model_id TEXT",
  "ALTER TABLE turns ADD COLUMN protocol TEXT",
  "ALTER TABLE turns ADD COLUMN reused_native INTEGER",
  "ALTER TABLE turns ADD COLUMN status TEXT",
  "ALTER TABLE turns ADD COLUMN event_summary TEXT",
  "ALTER TABLE turns ADD COLUMN context_source TEXT",
];

function migrateTurnColumns(db: { exec: (sql: string) => void }): void {
  for (const sql of TURN_MIGRATIONS) {
    try {
      db.exec(sql);
    } catch {
      // 列已存在时忽略，保持旧库可直接升级。
    }
  }
}

export function createSessionStore(dbPath: string): SessionStore {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  migrateTurnColumns(db);

  const insertSession = db.query<unknown, [string, string, string, number, number]>(
    `INSERT INTO sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?)`,
  );
  const selectSession = db.query<SessionRow, [string]>(
    `SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`,
  );
  const touchSession = db.query<unknown, [number, string]>(
    "UPDATE sessions SET updated_at = ? WHERE id = ?",
  );
  const insertTurn = db.query<
    unknown,
    [
      string,
      string,
      string,
      string,
      number | null,
      string | null,
      number,
      number,
      string | null,
      string | null,
      number | null,
      string | null,
      string | null,
      string | null,
    ]
  >(
    "INSERT INTO turns (session_id, cli_id, prompt, output, exit_code, signal, duration_ms, created_at, model_id, protocol, reused_native, status, event_summary, context_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const selectTurn = db.query<TurnRow, [number]>(
    `SELECT ${TURN_COLUMNS} FROM turns WHERE id = ?`,
  );
  const selectTurns = db.query<TurnRow, [string]>(
    `SELECT ${TURN_COLUMNS} FROM turns WHERE session_id = ? ORDER BY id ASC`,
  );
  const deleteOldTurns = db.query<unknown, [number]>(
    `DELETE FROM turns
     WHERE session_id IN (
       SELECT id FROM sessions ORDER BY updated_at DESC, id DESC LIMIT -1 OFFSET ?
     )`,
  );
  const deleteOldSessions = db.query<unknown, [number]>(
    `DELETE FROM sessions
     WHERE id IN (
       SELECT id FROM sessions ORDER BY updated_at DESC, id DESC LIMIT -1 OFFSET ?
     )`,
  );
  const prune = db.transaction((keep: number): number => {
    deleteOldTurns.run(keep);
    return deleteOldSessions.run(keep).changes;
  });

  const selectPreference = db.query<{ value: string }, [string]>(
    "SELECT value FROM preferences WHERE key = ?",
  );
  const upsertPreference = db.query<unknown, [string, string, number]>(
    `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const deletePreference = db.query<unknown, [string]>(
    "DELETE FROM preferences WHERE key = ?",
  );

  return {
    createSession(cliId, title) {
      const now = Date.now();
      const id = randomUUID();
      insertSession.run(id, cliId, title, now, now);
      const row = selectSession.get(id);
      if (!row) {
        throw new Error(`session insert failed: ${id}`);
      }
      return rowToSession(row);
    },

    getSession(id) {
      const row = selectSession.get(id);
      return row ? rowToSession(row) : null;
    },

    listTurns(sessionId) {
      return selectTurns.all(sessionId).map(rowToTurn);
    },

    appendTurn(input) {
      const now = Date.now();
      const result = insertTurn.run(
        input.sessionId,
        input.cliId,
        input.prompt,
        input.output,
        input.exitCode,
        input.signal,
        input.durationMs,
        now,
        input.modelId ?? null,
        input.protocol ?? null,
        input.reusedNative === undefined ? null : input.reusedNative ? 1 : 0,
        input.status ?? null,
        input.eventSummary ?? null,
        input.contextSource ?? null,
      );
      touchSession.run(now, input.sessionId);
      const row = selectTurn.get(Number(result.lastInsertRowid));
      if (!row) {
        throw new Error(`turn insert failed in session ${input.sessionId}`);
      }
      return rowToTurn(row);
    },

    pruneSessions(keep) {
      const removed = prune(Math.max(0, Math.floor(keep)));
      if (removed > 0) {
        // VACUUM 会重写数据库文件，让删除后的空间真正归还磁盘。
        db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
        db.exec("VACUUM;");
      }
      return removed;
    },

    getPreference(key) {
      const row = selectPreference.get(key);
      return row ? row.value : null;
    },

    setPreference(key, value) {
      upsertPreference.run(key, value, Date.now());
    },

    deletePreference(key) {
      deletePreference.run(key);
    },

    getFavoriteAgent() {
      const val = this.getPreference("favorite_agent");
      if (val && (CLI_IDS as readonly string[]).includes(val)) {
        return val as CliId;
      }
      return null;
    },

    setFavoriteAgent(cliId) {
      this.setPreference("favorite_agent", cliId);
    },

    clearFavoriteAgent() {
      this.deletePreference("favorite_agent");
    },

    close() {
      db.close();
    },
  };
}
