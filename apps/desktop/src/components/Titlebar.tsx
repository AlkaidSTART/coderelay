import { TerminalIcon } from "./icons";

export interface TitlebarProps {
  statusTone: string;
  runtimeCoreVersion?: string;
  rightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

export function Titlebar({
  statusTone,
  runtimeCoreVersion,
  rightSidebarOpen,
  onToggleRightSidebar,
}: TitlebarProps) {
  return (
    <header
      className="relative z-20 flex min-h-[38px] shrink-0 basis-[38px] items-center justify-between border-b border-line bg-canvas pr-3.5 pl-[76px] select-none"
      data-tauri-drag-region
    >
      <div className="h-full w-12" data-tauri-drag-region />
      <div className="h-full flex-1" data-tauri-drag-region />
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300 data-[tone=error]:bg-danger data-[tone=loading]:animate-breathe data-[tone=loading]:bg-ink data-[tone=loading]:shadow-[0_0_0_3px_rgba(17,18,21,0.08)] data-[tone=ready]:bg-success data-[tone=running]:animate-breathe data-[tone=running]:bg-ink data-[tone=running]:shadow-[0_0_0_3px_rgba(17,18,21,0.08)]"
          data-tone={statusTone}
          title={runtimeCoreVersion ? `v${runtimeCoreVersion}` : statusTone}
        />
        <button
          aria-label="Agents"
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-[7px] transition-colors duration-140 enabled:hover:bg-surface-subtle enabled:hover:text-ink disabled:opacity-35 ${
            rightSidebarOpen ? "bg-surface-subtle text-ink" : "bg-transparent text-muted"
          }`}
          onClick={onToggleRightSidebar}
          title="Agents"
          type="button"
        >
          <TerminalIcon size={15} />
        </button>
      </div>
    </header>
  );
}
