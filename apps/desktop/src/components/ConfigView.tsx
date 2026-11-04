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
      className="secondary-view config-page"
      aria-live="polite"
    >
      <div className="secondary-page config-page">
        <div className="secondary-header">
          <span className="secondary-path">{configPath ?? ""}</span>
          <div className="config-actions">
            <button
              aria-label="Reload"
              className="icon-button"
              disabled={configBusy}
              onClick={onLoadConfigSource}
              title="Reload"
              type="button"
            >
              <RefreshIcon size={15} />
            </button>
            <button
              aria-label="Save"
              className="circle-send-btn circle-send-btn--active"
              disabled={configBusy || !configDraft.trim()}
              onClick={onSaveConfig}
              title="Save"
              type="button"
            >
              <CheckIcon size={15} />
            </button>
          </div>
        </div>

        <section className="credential-bar" aria-label="API Key">
          <KeyIcon size={15} />
          <span
            className="status-dot"
            data-tone={
              jevSettings?.stored || jevSettings?.environmentConfigured
                ? "ready"
                : "idle"
            }
          />
          <input
            autoComplete="off"
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
            className="icon-button"
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
              className="icon-button"
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
          className="config-editor"
          onChange={(event) => onConfigDraftChange(event.target.value)}
          spellCheck={false}
          value={configDraft}
        />
      </div>
    </motion.section>
  );
}
