import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { Database } from "bun:sqlite";

import { configDirFor } from "../config/loader";
import type { CliId } from "../models/cli";
import type { SessionRecord, SessionTurn } from "../models/session";

export interface AppendTurnInput {
  readonly sessionId: string;
  readonly cliId: CliId;
  readonly prompt: string;
  readonly output: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
}

export interface SessionStore {
  createSession(cliId: CliId, title: string): SessionRecord;
  getSession(id: string): SessionRecord | null;
  listTurns(sessionId: string): readonly SessionTurn[];
  appendTurn(input: AppendTurnInput): SessionTurn;
  pruneSessions(keep: number): number;
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
}

const SESSION_COLUMNS =
  "id, cli_id, title, created_at, updated_at";
const TURN_COLUMNS =
  "id, session_id, cli_id, prompt, output, exit_code, signal, duration_ms, created_at";

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
  };
}

export function createSessionStore(dbPath: string): SessionStore {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

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
    [string, string, string, string, number | null, string | null, number, number]
  >(
    "INSERT INTO turns (session_id, cli_id, prompt, output, exit_code, signal, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
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

    close() {
      db.close();
    },
  };
}
