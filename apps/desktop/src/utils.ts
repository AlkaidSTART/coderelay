import dayjs, { type ConfigType } from "dayjs";
import "dayjs/locale/zh-cn";

import type {
  AgentEntry,
  AgentEvent,
  ModelOption,
  RouteForm,
  TimePeriod,
  WelcomeTimeSnapshot,
} from "./types";

dayjs.locale("zh-cn");

export const PERIOD_GREETINGS: Record<TimePeriod, string> = {
  morning: "早上好",
  afternoon: "下午好",
  evening: "晚上好",
  late_night: "夜深了",
};

export const ENCOURAGEMENT_MESSAGES = [
  "保持专注，每一行代码都在构建未来。",
  "化繁为简，灵感往往诞生于动手的那一刻。",
  "稳扎稳打，今天的小步推进都是明天的突破。",
  "好奇心是最好的编译器，尽情探索新的可能。",
  "相信自己的节奏，优秀的架构源自耐心的打磨。",
  "每一个难题的解开，都在拓宽你的技术边界。",
] as const;

export function getTimePeriod(input?: ConfigType): TimePeriod {
  const hour = dayjs(input).hour();
  if (hour >= 5 && hour < 12) {
    return "morning";
  }
  if (hour >= 12 && hour < 18) {
    return "afternoon";
  }
  if (hour >= 18 && hour < 23) {
    return "evening";
  }
  return "late_night";
}

export function getWelcomeTimeSnapshot(
  input?: ConfigType,
  encouragementIndex?: number,
): WelcomeTimeSnapshot {
  const now = dayjs(input);
  const period = getTimePeriod(now);
  const resolvedIndex =
    encouragementIndex !== undefined
      ? Math.abs(Math.trunc(encouragementIndex)) % ENCOURAGEMENT_MESSAGES.length
      : (now.date() + now.hour()) % ENCOURAGEMENT_MESSAGES.length;

  return {
    period,
    greeting: PERIOD_GREETINGS[period],
    formattedTime: now.format("HH:mm:ss"),
    formattedDate: now.format("YYYY年MM月DD日 dddd"),
    encouragement: ENCOURAGEMENT_MESSAGES[resolvedIndex] ?? ENCOURAGEMENT_MESSAGES[0],
  };
}

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

export function mergeRecentWorkspaces(
  currentCwd: string,
  discoveredWorkspaces: readonly string[],
  existingWorkspaces: readonly string[] = [],
  limit = 8,
): string[] {
  const maxItems = Math.max(1, Math.trunc(limit));
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of [currentCwd, ...discoveredWorkspaces, ...existingWorkspaces]) {
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

export function formatTimestamp(timestamp: number): string {
  return dayjs(timestamp).format("MM/DD HH:mm");
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

export interface ResolvedRouteSelection {
  mode: string;
  agent: string;
  model: string;
}

export function getAvailableModelsForCli(
  catalogOptions: readonly ModelOption[],
  cliId: string,
): ModelOption[] {
  if (!cliId) {
    return [];
  }
  return catalogOptions.filter((option) => option.cliId === cliId && option.available);
}

export function resolveRouteSelection(
  current: Pick<RouteForm, "mode" | "agent" | "model">,
  routingModes: readonly string[],
  agents: readonly AgentEntry[],
  catalogOptions: readonly ModelOption[],
): ResolvedRouteSelection {
  const mode =
    routingModes.length > 0 && routingModes.includes(current.mode)
      ? current.mode
      : (routingModes[0] ?? "local");

  const agent =
    agents.length > 0 && agents.some((item) => item.id === current.agent)
      ? current.agent
      : (agents[0]?.id ?? "");

  const availableModels = getAvailableModelsForCli(catalogOptions, agent);
  const model =
    availableModels.length > 0 && availableModels.some((item) => item.modelId === current.model)
      ? current.model
      : (availableModels[0]?.modelId ?? "");

  return { mode, agent, model };
}
