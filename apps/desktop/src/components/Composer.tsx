import { motion } from "motion/react";
import type { KeyboardEvent } from "react";

import type { AgentEntry, ModelOption } from "../types";
import {
  formatModeLabel,
  getAvailableModelsForCli,
  resolveRouteSelection,
} from "../utils";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  FolderIcon,
  RouteIcon,
  StopIcon,
} from "./icons";

export interface ComposerProps {
  compact?: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  running: boolean;
  onStartRun: () => void;
  onCancelRun: () => void;
  workspaceInput: string;
  onPickWorkspace: () => void;
  mode: string;
  routingModes: string[];
  onModeChange: (mode: string) => void;
  onPreviewRoute: () => void;
  agent: string;
  model: string;
  onAgentModelChange: (agent: string, model: string) => void;
  agents: AgentEntry[];
  catalogOptions: ModelOption[];
  selectedAgentLabel?: string;
}

const ACTION_BTN_BASE =
  "grid h-[30px] w-[30px] place-items-center rounded-lg transition-all duration-140 enabled:hover:bg-surface-subtle enabled:hover:text-ink disabled:opacity-30";

const SELECT_PILL_BASE =
  "relative inline-flex cursor-pointer items-center gap-1 rounded-lg border border-black/[0.06] bg-surface-subtle/80 px-2.5 py-1.5 font-code text-[11.5px] font-medium text-ink transition-colors hover:border-black/[0.12] hover:bg-surface-hover";

export function Composer({
  compact = false,
  prompt,
  onPromptChange,
  running,
  onStartRun,
  onCancelRun,
  workspaceInput,
  onPickWorkspace,
  mode,
  routingModes,
  onModeChange,
  onPreviewRoute,
  agent,
  model,
  onAgentModelChange,
  agents,
  catalogOptions,
}: ComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (prompt.trim() && !running) {
        onStartRun();
      }
    }
  }

  const effectiveRoutingModes = routingModes.length > 0 ? routingModes : ["local"];
  const resolved = resolveRouteSelection(
    { mode, agent, model },
    effectiveRoutingModes,
    agents,
    catalogOptions,
  );

  const activeMode = resolved.mode;
  const activeAgent = resolved.agent;
  const activeModel = resolved.model;

  const currentAgentEntry = agents.find((ag) => ag.id === activeAgent) ?? agents[0];
  const currentAgentLabel = currentAgentEntry?.label ?? activeAgent;

  const availableModels = getAvailableModelsForCli(catalogOptions, activeAgent);
  const currentModelOption =
    availableModels.find((m) => m.modelId === activeModel) ?? availableModels[0];
  const currentModelLabel =
    currentModelOption?.label ||
    currentModelOption?.modelId ||
    activeModel ||
    currentAgentLabel ||
    "默认";

  function handleCliChange(nextAgentId: string) {
    const nextModels = getAvailableModelsForCli(catalogOptions, nextAgentId);
    const nextModelId = nextModels[0]?.modelId ?? "";
    onAgentModelChange(nextAgentId, nextModelId);
  }

  function handleModelChange(nextModelId: string) {
    onAgentModelChange(activeAgent, nextModelId);
  }

  const hasPrompt = Boolean(prompt.trim());

  return (
    <div
      className={`mx-auto w-[min(700px,100%)] border border-black/[0.075] bg-white transition-[border-color,box-shadow] duration-180 focus-within:border-black/15 focus-within:shadow-[0_16px_44px_-8px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.035)] ${
        compact
          ? "rounded-[18px] shadow-[0_6px_24px_-4px_rgba(0,0,0,0.05),0_1px_3px_rgba(0,0,0,0.02)]"
          : "rounded-[22px] shadow-[0_10px_36px_-8px_rgba(0,0,0,0.055),0_2px_6px_rgba(0,0,0,0.025)]"
      }`}
    >
      <textarea
        aria-label="Prompt"
        className={`block max-h-[200px] w-full resize-none border-0 bg-transparent leading-[1.65] text-ink placeholder:text-zinc-300 ${
          compact
            ? "min-h-[52px] px-4 pt-3.5 pb-1.5 text-sm"
            : "min-h-[76px] px-5 pt-[18px] pb-2 text-[15px]"
        }`}
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="›"
        disabled={running}
      />

      <div className="flex items-center justify-between gap-2 px-3.5 pt-1.5 pb-3">
        <div className="flex items-center gap-1.5">
          <button
            aria-label="选择文件夹"
            className={`${ACTION_BTN_BASE} bg-transparent text-muted`}
            type="button"
            onClick={onPickWorkspace}
            title={workspaceInput ? `选择文件夹（当前：${workspaceInput}）` : "选择文件夹"}
          >
            <FolderIcon size={14} />
          </button>
          <button
            aria-label="Route preview"
            className={`${ACTION_BTN_BASE} bg-transparent text-muted`}
            disabled={!hasPrompt}
            type="button"
            onClick={onPreviewRoute}
            title="Route preview"
          >
            <RouteIcon size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* 第一块：选模式 */}
          <div className={SELECT_PILL_BASE} title={`模式: ${activeMode}`}>
            <select
              aria-label="模式"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={activeMode}
              onChange={(e) => onModeChange(e.target.value)}
              disabled={running}
            >
              {effectiveRoutingModes.map((m) => (
                <option key={m} value={m}>
                  {formatModeLabel(m)}
                </option>
              ))}
            </select>
            <span className="max-w-[70px] truncate">{formatModeLabel(activeMode)}</span>
            <ChevronDownIcon size={11} className="text-muted" />
          </div>

          {/* 第二块：选 CLI */}
          <div className={SELECT_PILL_BASE} title={`CLI: ${currentAgentLabel}`}>
            <select
              aria-label="CLI"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={activeAgent}
              onChange={(e) => handleCliChange(e.target.value)}
              disabled={running}
            >
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.label}
                </option>
              ))}
            </select>
            <span className="max-w-[90px] truncate">{currentAgentLabel}</span>
            <ChevronDownIcon size={11} className="text-muted" />
          </div>

          {/* 第三块：选 agent / 模型 */}
          <div className={SELECT_PILL_BASE} title={`模型: ${currentModelLabel}`}>
            <select
              aria-label="Agent 模型"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={activeModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={running}
            >
              {availableModels.length > 0 ? (
                availableModels.map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {m.label || m.modelId}
                  </option>
                ))
              ) : (
                <option value="">{currentAgentLabel || "默认"}</option>
              )}
            </select>
            <span className="max-w-[120px] truncate">{currentModelLabel}</span>
            <ChevronDownIcon size={11} className="text-muted" />
          </div>

          {running ? (
            <motion.button
              aria-label="Stop"
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-white transition-all duration-140"
              onClick={onCancelRun}
              title="Stop"
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
            >
              <StopIcon size={12} />
            </motion.button>
          ) : (
            <motion.button
              aria-label="Run"
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-all duration-140 ${
                hasPrompt
                  ? "cursor-pointer bg-ink text-white enabled:hover:bg-black disabled:bg-surface-subtle disabled:text-zinc-300"
                  : "bg-surface-subtle text-zinc-400"
              }`}
              disabled={!hasPrompt}
              onClick={onStartRun}
              title="Run"
              type="button"
              whileHover={hasPrompt ? { scale: 1.05 } : undefined}
              whileTap={hasPrompt ? { scale: 0.94 } : undefined}
            >
              <ArrowUpIcon size={16} />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
