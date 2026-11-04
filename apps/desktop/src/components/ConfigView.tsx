import { motion } from "motion/react";

import { useThemeStore } from "../stores/themeStore";
import { THEME_PRESETS } from "../types";
import { CheckIcon, PaletteIcon, RefreshIcon } from "./icons";

export interface ConfigViewProps {
  configPath?: string;
  configBusy: boolean;
  configDraft: string;
  onConfigDraftChange: (value: string) => void;
  onLoadConfigSource: () => void;
  onSaveConfig: () => void;
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
}: ConfigViewProps) {
  const currentPreset = useThemeStore((s) => s.preset);
  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);
  const setPreset = useThemeStore((s) => s.setPreset);

  const activePreset =
    THEME_PRESETS.find((p) => p.id === currentPreset) ?? THEME_PRESETS[0];

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
          <span className="truncate font-code text-xs text-muted-strong">
            {configPath ?? ""}
          </span>
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
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-canvas transition-all duration-140 enabled:hover:opacity-85 disabled:bg-surface-subtle disabled:text-muted"
              disabled={configBusy || !configDraft.trim()}
              onClick={onSaveConfig}
              title="Save"
              type="button"
            >
              <CheckIcon size={15} />
            </button>
          </div>
        </div>

        {/* Theme Presets Selection (ChatGPT Style) */}
        <section
          className="flex flex-col gap-3 rounded-xl border border-line bg-sidebar p-3.5"
          aria-label="主题预设"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PaletteIcon size={16} />
              <span className="text-xs font-semibold tracking-[-0.01em] text-ink">
                主题外观
              </span>
              <span className="text-[11px] text-muted">
                模 ChatGPT 多风格配色预设，默认纯白
              </span>
            </div>
            <span className="font-code text-[11px] text-muted-strong">
              当前：{activePreset?.name ?? "默认白"}
              {activePreset?.subtitle ? ` (${activePreset.subtitle})` : ""}
              {currentPreset === "system" ? ` → ${effectiveTheme}` : ""}
            </span>
          </div>

          <div
            className="grid grid-cols-3 gap-2.5 max-[860px]:grid-cols-2 max-[560px]:grid-cols-1"
            role="radiogroup"
            aria-label="选择主题外观预设"
          >
            {THEME_PRESETS.map((preset) => {
              const isSelected = currentPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setPreset(preset.id)}
                  className={`group relative flex flex-col gap-2 rounded-[11px] border p-2.5 text-left transition-all duration-140 ${
                    isSelected
                      ? "border-ink bg-surface shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]"
                      : "border-line bg-surface/50 hover:border-line-strong hover:bg-surface"
                  }`}
                >
                  {/* Miniature UI Mockup */}
                  <div
                    className="relative flex h-14 w-full overflow-hidden rounded-[7px] border border-line"
                    style={{ backgroundColor: preset.preview.canvas }}
                  >
                    {/* Rail & Sidebar mockup */}
                    <div
                      className="flex w-1/3 flex-col gap-1 border-r border-line p-1.5"
                      style={{ backgroundColor: preset.preview.sidebar }}
                    >
                      <div
                        className="h-1.5 w-3/4 rounded-full opacity-45"
                        style={{ backgroundColor: preset.preview.ink }}
                      />
                      <div
                        className="h-1.5 w-1/2 rounded-full opacity-25"
                        style={{ backgroundColor: preset.preview.ink }}
                      />
                      <div
                        className="mt-auto h-1.5 w-2/3 rounded-full opacity-35"
                        style={{ backgroundColor: preset.preview.ink }}
                      />
                    </div>

                    {/* Canvas & message mockup */}
                    <div className="relative flex flex-1 flex-col justify-between p-1.5">
                      <div className="flex flex-col gap-1">
                        <div
                          className="h-1.5 w-2/5 rounded-full opacity-65"
                          style={{ backgroundColor: preset.preview.ink }}
                        />
                        <div
                          className="h-1.5 w-4/5 rounded-full opacity-35"
                          style={{ backgroundColor: preset.preview.ink }}
                        />
                      </div>
                      <div
                        className="h-2.5 w-full rounded border"
                        style={{
                          backgroundColor: preset.preview.surface,
                          borderColor: preset.preview.border,
                        }}
                      />
                    </div>

                    {/* Active check badge */}
                    {isSelected ? (
                      <div className="absolute top-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-ink text-canvas shadow-xs">
                        <CheckIcon size={10} />
                      </div>
                    ) : null}
                  </div>

                  {/* Preset Label & Description */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-ink">
                        {preset.name}
                      </span>
                      <span className="rounded bg-surface-subtle px-1.5 py-0.5 font-code text-[10px] text-muted-strong">
                        {preset.subtitle}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-[11px] leading-tight text-muted">
                      {preset.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
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
