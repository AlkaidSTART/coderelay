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

  return (
    <div className={`hero-composer-card ${compact ? "hero-composer-card--dock" : ""}`}>
      <textarea
        aria-label="Prompt"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="›"
        disabled={running}
      />

      <div className="composer-toolbar">
        <div className="composer-toolbar-left">
          <button
            aria-label="Workspace"
            className="composer-action-btn"
            type="button"
            onClick={onToggleWorkspaceDropdown}
            title={workspaceInput || "Workspace"}
          >
            <FolderIcon size={14} />
          </button>
          <button
            aria-label="Routing mode"
            className={`composer-action-btn ${mode !== "local" ? "composer-action-btn--active" : ""}`}
            type="button"
            onClick={cycleRoutingMode}
            title={mode}
          >
            <ShieldIcon size={14} />
          </button>
          <button
            aria-label="Route preview"
            className="composer-action-btn"
            disabled={!prompt.trim()}
            type="button"
            onClick={onPreviewRoute}
            title="Route preview"
          >
            <RouteIcon size={14} />
          </button>
        </div>

        <div
          className="model-select-capsule"
          title={model || selectedAgentLabel || "Auto"}
        >
          <select
            aria-label="Model"
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
          <span className="model-capsule-label">
            {model ? model : selectedAgentLabel ? selectedAgentLabel : "Auto"}
          </span>
          <ChevronDownIcon size={11} />
        </div>

        {running ? (
          <motion.button
            aria-label="Stop"
            className="circle-send-btn circle-send-btn--stop"
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
            className={`circle-send-btn ${prompt.trim() ? "circle-send-btn--active" : ""}`}
            disabled={!prompt.trim()}
            onClick={onStartRun}
            title="Run"
            type="button"
            whileHover={prompt.trim() ? { scale: 1.05 } : undefined}
            whileTap={prompt.trim() ? { scale: 0.94 } : undefined}
          >
            <ArrowUpIcon size={16} />
          </motion.button>
        )}
      </div>
    </div>
  );
}
