import { motion } from "motion/react";

import type { JevSettings } from "../types";
import { CheckIcon, CloseIcon, KeyIcon, RefreshIcon } from "./icons";

export interface ConfigViewProps {
  configPath?: string;
  configBusy: boolean;
  configDraft: string;
  onConfigDraftChange: (value: string) => void;
  onLoadConfigSource: () => void;
  onSaveConfig: () => void;
  jevBusy: boolean;
  jevSettings: JevSettings | null;
  jevApiKeyInput: string;
  onJevApiKeyInputChange: (value: string) => void;
  onSaveJevApiKey: () => void;
  onClearJevApiKey: () => void;
}

const ICON_BTN_CLASS =
  "grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-transparent text-muted transition-colors duration-140 enabled:hover:bg-surface-subtle enabled:hover:text-ink disabled:opacity-35";

export function ConfigView({
  configPath,
  configBusy,
  configDraft,
  onConfigDraftChange,
  onLoadConfigSource,
  onSaveConfig,
  jevBusy,
  jevSettings,
  jevApiKeyInput,
  onJevApiKeyInputChange,
  onSaveJevApiKey,
  onClearJevApiKey,
}: ConfigViewProps) {
  return (
    <motion.section
      key="config"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-10 py-7 max-[900px]:px-6 max-[900px]:py-5"
      aria-live="polite"
    >
      <div className="mx-auto flex h-full w-[min(920px,100%)] flex-col gap-3.5">
        <div className="flex items-center justify-between gap-4 border-b border-line pb-3.5">
          <span className="truncate font-code text-xs text-muted-strong">{configPath ?? ""}</span>
          <div className="flex items-center gap-2">
            <button
              aria-label="Reload"
              className={ICON_BTN_CLASS}
              disabled={configBusy}
              onClick={onLoadConfigSource}
              title="Reload"
              type="button"
            >
              <RefreshIcon size={15} />
            </button>
            <button
              aria-label="Save"
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-white transition-all duration-140 enabled:hover:bg-black disabled:bg-surface-subtle disabled:text-zinc-300"
              disabled={configBusy || !configDraft.trim()}
              onClick={onSaveConfig}
              title="Save"
              type="button"
            >
              <CheckIcon size={15} />
            </button>
          </div>
        </div>

        <section
          className="flex items-center gap-2.5 rounded-xl border border-line bg-sidebar px-3 py-2 text-muted-strong"
          aria-label="API Key"
        >
          <KeyIcon size={15} />
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300 data-[tone=ready]:bg-success"
            data-tone={
              jevSettings?.stored || jevSettings?.environmentConfigured ? "ready" : "idle"
            }
          />
          <input
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent font-code text-xs text-ink placeholder:text-zinc-400"
            disabled={jevBusy}
            id="jev-api-key"
            onChange={(event) => onJevApiKeyInputChange(event.target.value)}
            placeholder="TYPESAFE_API_KEY"
            spellCheck={false}
            type="password"
            value={jevApiKeyInput}
          />
          <button
            aria-label="Save API Key"
            className={ICON_BTN_CLASS}
            disabled={jevBusy || !jevApiKeyInput.trim()}
            onClick={onSaveJevApiKey}
            title="Save"
            type="button"
          >
            <CheckIcon size={14} />
          </button>
          {jevSettings?.stored ? (
            <button
              aria-label="Clear API Key"
              className={ICON_BTN_CLASS}
              disabled={jevBusy}
              onClick={onClearJevApiKey}
              title="Clear"
              type="button"
            >
              <CloseIcon size={14} />
            </button>
          ) : null}
        </section>

        <textarea
          aria-label="Config YAML"
          className="min-h-[420px] w-full flex-1 resize-none rounded-[14px] border border-line bg-sidebar p-[18px] font-code text-xs leading-[1.7] text-ink transition-colors duration-140 outline-none [tab-size:2] focus:border-line-strong"
          onChange={(event) => onConfigDraftChange(event.target.value)}
          spellCheck={false}
          value={configDraft}
        />
      </div>
    </motion.section>
  );
}
