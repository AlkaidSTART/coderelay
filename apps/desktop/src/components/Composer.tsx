import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { AgentEntry, ModelOption } from "../types";
import {
  ArrowUpIcon,
  CheckIcon,
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
  selectedAgentLabel,
}: ComposerProps) {
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<"top" | "bottom">("bottom");
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (running && modelMenuOpen) {
      setModelMenuOpen(false);
    }
  }, [running, modelMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setModelMenuOpen(false);
      }
    }
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setModelMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [modelMenuOpen]);

  function toggleModelMenu() {
    if (running) {
      return;
    }
    if (!modelMenuOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setMenuPlacement(compact || (spaceBelow < 280 && spaceAbove > spaceBelow) ? "top" : "bottom");
    }
    setModelMenuOpen((prev) => !prev);
  }

  function handleSelectOption(nextAgent: string, nextModel: string) {
    onAgentModelChange(nextAgent, nextModel);
    setModelMenuOpen(false);
  }

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
  const selectedModelOption = model
    ? catalogOptions.find((m) => m.cliId === agent && m.modelId === model)
    : undefined;
  const currentSelectionLabel = model
    ? selectedModelOption?.label || model
    : selectedAgentLabel
      ? selectedAgentLabel
      : "Auto";
  const isAutoSelected = !agent && !model;

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
            aria-label="选择文件夹"
            className={`${ACTION_BTN_BASE} bg-transparent text-muted`}
            type="button"
            onClick={onPickWorkspace}
            title={workspaceInput ? `选择文件夹（当前：${workspaceInput}）` : "选择文件夹"}
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

        <div ref={modelMenuRef} className="relative inline-flex items-center">
          <button
            ref={triggerRef}
            aria-expanded={modelMenuOpen}
            aria-haspopup="listbox"
            aria-label="选择模型"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-black/[0.06] bg-surface-subtle/80 px-3 py-1.5 font-code text-[11.5px] font-medium text-muted-strong shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-140 hover:border-black/[0.12] hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-black/10"
            disabled={running}
            onClick={toggleModelMenu}
            title={currentSelectionLabel}
            type="button"
          >
            <span className="max-w-[140px] truncate">{currentSelectionLabel}</span>
            <span
              className={`text-muted transition-transform duration-200 ${
                modelMenuOpen ? "rotate-180" : ""
              }`}
            >
              <ChevronDownIcon size={11} />
            </span>
          </button>

          <AnimatePresence>
            {modelMenuOpen ? (
              <motion.div
                role="listbox"
                aria-label="模型列表"
                initial={{
                  opacity: 0,
                  scale: 0.96,
                  y: menuPlacement === "top" ? 6 : -6,
                }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
                  y: menuPlacement === "top" ? 6 : -6,
                }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className={`absolute right-0 z-50 flex max-h-[320px] w-[260px] flex-col overflow-hidden rounded-[20px] border border-black/[0.08] bg-white/95 p-1.5 shadow-[0_18px_48px_-8px_rgba(0,0,0,0.14),0_4px_16px_-4px_rgba(0,0,0,0.06)] backdrop-blur-md ${
                  menuPlacement === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
                }`}
              >
                <div className="flex-1 overflow-y-auto p-1 [scrollbar-color:rgba(0,0,0,0.12)_transparent] [scrollbar-width:thin]">
                  {/* Auto option */}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isAutoSelected}
                    onClick={() => handleSelectOption("", "")}
                    className={`flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left font-code text-xs transition-all duration-120 ${
                      isAutoSelected
                        ? "bg-black/[0.06] font-semibold text-ink"
                        : "text-ink-soft hover:bg-black/[0.035] hover:text-ink"
                    }`}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-ink">
                      {isAutoSelected ? <CheckIcon size={13} /> : null}
                    </span>
                    <span className="truncate">Auto</span>
                  </button>

                  {/* Agents and their models */}
                  {agents.map((ag) => {
                    const agentModels = catalogOptions.filter(
                      (m) => m.cliId === ag.id && m.available,
                    );
                    const isAgentDefaultSelected = agent === ag.id && !model;

                    return (
                      <div key={ag.id} className="mt-2.5 first:mt-1">
                        <div className="px-2.5 py-1 text-[10.5px] font-semibold tracking-wider text-muted/70 uppercase select-none">
                          {ag.label}
                        </div>

                        <button
                          type="button"
                          role="option"
                          aria-selected={isAgentDefaultSelected}
                          onClick={() => handleSelectOption(ag.id, "")}
                          className={`flex w-full items-center gap-2 rounded-[12px] px-2.5 py-1.5 text-left font-code text-xs transition-all duration-120 ${
                            isAgentDefaultSelected
                              ? "bg-black/[0.06] font-semibold text-ink"
                              : "text-ink-soft hover:bg-black/[0.035] hover:text-ink"
                          }`}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-ink">
                            {isAgentDefaultSelected ? <CheckIcon size={13} /> : null}
                          </span>
                          <span className="truncate">{ag.label}</span>
                        </button>

                        {agentModels.map((m) => {
                          const isModelSelected = agent === ag.id && model === m.modelId;
                          return (
                            <button
                              key={`${ag.id}:::${m.modelId}`}
                              type="button"
                              role="option"
                              aria-selected={isModelSelected}
                              onClick={() => handleSelectOption(ag.id, m.modelId)}
                              className={`flex w-full items-center gap-2 rounded-[12px] px-2.5 py-1.5 text-left font-code text-xs transition-all duration-120 ${
                                isModelSelected
                                  ? "bg-black/[0.06] font-semibold text-ink"
                                  : "text-ink-soft hover:bg-black/[0.035] hover:text-ink"
                              }`}
                              title={m.label || m.modelId}
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-ink">
                                {isModelSelected ? <CheckIcon size={13} /> : null}
                              </span>
                              <span className="truncate">{m.label || m.modelId}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
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
