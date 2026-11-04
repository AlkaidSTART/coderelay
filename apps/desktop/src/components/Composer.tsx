import { motion } from "motion/react";
import type { KeyboardEvent } from "react";

import type { AgentEntry, ModelOption } from "../types";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  FolderIcon,
  RouteIcon,
  ShieldIcon,
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
  onToggleWorkspaceDropdown: () => void;
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

export function Composer({
  compact = false,
  prompt,
  onPromptChange,
  running,
  onStartRun,
  onCancelRun,
  workspaceInput,
  onToggleWorkspaceDropdown,
  mode,
  routingModes,
  onModeChange,
  onPreviewRoute,
  agent,
  model,
  onAgentModelChange,
  agents,
  catalogOptions,
  selectedAgentLabel,
}: ComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (prompt.trim() && !running) {
        onStartRun();
      }
    }
  }

  function cycleRoutingMode() {
    const modes = routingModes.length > 0 ? routingModes : ["local"];
    const nextIdx = (modes.indexOf(mode) + 1) % modes.length;
    onModeChange(modes[nextIdx] ?? "local");
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

      <div className="flex items-center justify-between px-3.5 pt-1.5 pb-3">
        <div className="flex items-center gap-1.5">
          <button
            aria-label="Workspace"
            className={`${ACTION_BTN_BASE} bg-transparent text-muted`}
            type="button"
            onClick={onToggleWorkspaceDropdown}
            title={workspaceInput || "Workspace"}
          >
            <FolderIcon size={14} />
          </button>
          <button
            aria-label="Routing mode"
            className={`${ACTION_BTN_BASE} ${
              mode !== "local" ? "bg-surface-subtle text-ink" : "bg-transparent text-muted"
            }`}
            type="button"
            onClick={cycleRoutingMode}
            title={mode}
          >
            <ShieldIcon size={14} />
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

        <div
          className="relative inline-flex cursor-pointer items-center gap-[5px] rounded-lg bg-transparent px-2.5 py-[5px] font-code text-[11.5px] text-muted-strong transition-colors duration-140 hover:bg-surface-subtle hover:text-ink"
          title={model || selectedAgentLabel || "Auto"}
        >
          <select
            aria-label="Model"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={agent ? `${agent}:::${model}` : ""}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                onAgentModelChange("", "");
              } else {
                const [agentId, modelId] = val.split(":::");
                onAgentModelChange(agentId ?? "", modelId ?? "");
              }
            }}
            disabled={running}
          >
            <option value="">Auto</option>
            {agents.map((ag) => (
              <optgroup key={ag.id} label={ag.label}>
                <option value={`${ag.id}:::`}>{ag.label}</option>
                {catalogOptions
                  .filter((m) => m.cliId === ag.id && m.available)
                  .map((m) => (
                    <option key={`${ag.id}:::${m.modelId}`} value={`${ag.id}:::${m.modelId}`}>
                      {m.label || m.modelId}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <span className="max-w-[150px] truncate">
            {model ? model : selectedAgentLabel ? selectedAgentLabel : "Auto"}
          </span>
          <ChevronDownIcon size={11} />
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
  );
}
