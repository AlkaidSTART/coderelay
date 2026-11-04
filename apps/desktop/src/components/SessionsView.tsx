import { AnimatePresence, motion } from "motion/react";

import type { SessionDetail, SessionRecord } from "../types";
import { formatTimestamp, workspaceName } from "../utils";
import { ArrowUpIcon, HistoryIcon, RefreshIcon, TerminalIcon } from "./icons";

export interface SessionsViewProps {
  workspaceInput: string;
  sessions: SessionRecord[];
  activeSessionId: string | null;
  sessionDetail: SessionDetail | null;
  onRefreshSessions: () => void;
  onOpenSession: (sessionId: string) => void;
  onContinueSession: () => void;
}

export function SessionsView({
  workspaceInput,
  sessions,
  activeSessionId,
  sessionDetail,
  onRefreshSessions,
  onOpenSession,
  onContinueSession,
}: SessionsViewProps) {
  return (
    <motion.section
      key="sessions"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      className="secondary-view"
      aria-live="polite"
    >
      <div className="secondary-page">
        <div className="secondary-header">
          <span className="secondary-path">{workspaceName(workspaceInput)}</span>
          <button
            aria-label="Refresh"
            className="icon-button"
            onClick={onRefreshSessions}
            title="Refresh"
            type="button"
          >
            <RefreshIcon size={15} />
          </button>
        </div>

        <div className="session-layout">
          <div className="session-list">
            {sessions.length === 0 ? (
              <div className="secondary-empty">
                <HistoryIcon />
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  className={`session-row ${activeSessionId === session.id ? "session-row--selected" : ""}`}
                  key={session.id}
                  onClick={() => onOpenSession(session.id)}
                  type="button"
                >
                  <span className="session-agent">{session.cliId}</span>
                  <strong>{session.title}</strong>
                  <small>{formatTimestamp(session.updatedAt)}</small>
                </button>
              ))
            )}
          </div>

          <div className="session-detail">
            <AnimatePresence mode="wait">
              {sessionDetail ? (
                <motion.div
                  key={sessionDetail.session.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
                  <div className="session-detail-head">
                    <h3>{sessionDetail.session.title}</h3>
                    <button
                      aria-label="Continue"
                      className="circle-send-btn circle-send-btn--active"
                      onClick={onContinueSession}
                      title="Continue"
                      type="button"
                    >
                      <ArrowUpIcon size={15} />
                    </button>
                  </div>
                  <div className="turn-list">
                    {sessionDetail.turns.map((turn) => (
                      <article className="turn-card" key={turn.id}>
                        <div className="turn-meta">
                          <span>{turn.cliId}</span>
                          {turn.modelId ? <span>{turn.modelId}</span> : null}
                        </div>
                        <div className="turn-prompt">{turn.prompt}</div>
                        {turn.output ? (
                          <pre className="turn-output">{turn.output}</pre>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="session-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="secondary-empty"
                >
                  <TerminalIcon />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
