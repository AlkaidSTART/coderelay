import type { AgentEvent } from "./types";

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function workspaceName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  if (!normalized) {
    return "—";
  }
  const segments = normalized.split(/[\\/]/);
  return segments[segments.length - 1] || normalized;
}

export function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = (durationMs / 1000).toFixed(1).replace(/\.0$/, "");
  return `${seconds}s`;
}

export function eventActivity(event: AgentEvent): string | null {
  if (event.kind === "tool_started") {
    return `tool · ${event.tool ?? "unknown"}`;
  }
  if (event.kind === "status") {
    return `status · ${event.text ?? ""}`;
  }
  if (event.kind === "stderr") {
    return event.text?.trim() || null;
  }
  if (event.kind === "failed") {
    return `error · ${event.message ?? "agent failed"}`;
  }
  if (event.kind === "aborted") {
    return `aborted · ${event.reason ?? "process stopped"}`;
  }
  return null;
}
