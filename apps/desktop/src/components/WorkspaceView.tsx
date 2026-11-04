import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import type { AgentRunResult, RoutePreview } from "../types";
import { formatDuration } from "../utils";
import { RouteIcon, TerminalIcon } from "./icons";

export interface WorkspaceViewProps {
  error: string | null;
  showThread: boolean;
  running: boolean;
  result: AgentRunResult | null;
  preview: RoutePreview | null;
  output: string;
  activity: string[];
  renderComposer: (compact?: boolean) => ReactNode;
}

export function WorkspaceView({
  error,
  showThread,
  running,
  result,
  preview,
  output,
  activity,
  renderComposer,
}: WorkspaceViewProps) {
  return (
    <motion.section
      key="workspace"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      className="conversation"
      aria-live="polite"
    >
      <div className="conversation-inner">
        <AnimatePresence>
          {error ? (
            <motion.div
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.18 }}
              className="alert"
              role="alert"
            >
              <span>{error}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!showThread ? (
            <motion.div
              key="welcome-hero"
              initial={{ opacity: 0, scale: 0.985, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.985, y: -10 }}
              transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              className="welcome-hero-container"
            >
              {renderComposer(false)}
            </motion.div>
          ) : (
            <motion.article
              key="assistant-message"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              className="assistant-message"
            >
              <div className="message-header">
                <span
                  className="status-dot"
                  data-tone={running ? "running" : "ready"}
                />
                {result ? (
                  <span className="run-duration">
                    {formatDuration(result.durationMs)}
                  </span>
                ) : null}
                {result?.code !== undefined &&
                result.code !== null &&
                result.code !== 0 ? (
                  <span className="run-state">{result.code}</span>
                ) : null}
              </div>

              <AnimatePresence>
                {preview ? (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.16 }}
                    className="route-preview"
                  >
                    <RouteIcon size={13} />
                    <strong>
                      {preview.agent}
                      {preview.model ? ` · ${preview.model}` : ""}
                    </strong>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div
                className={`message-copy ${running ? "message-copy--running" : ""}`}
              >
                {output}
                {running && !output ? (
                  <span className="typing-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : null}
              </div>

              <AnimatePresence>
                {activity.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.18 }}
                    className="activity-log"
                  >
                    <div className="activity-head">
                      <span className="activity-label">
                        <TerminalIcon size={13} />
                      </span>
                      <span>{activity.length}</span>
                    </div>
                    <div className="activity-body">
                      {activity.map((entry, index) => (
                        <div
                          className="activity-row"
                          key={`${index}-${entry}`}
                        >
                          <span className="activity-prefix">›</span>
                          <span>{entry}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.article>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
