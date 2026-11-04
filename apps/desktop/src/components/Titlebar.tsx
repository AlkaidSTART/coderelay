import { PanelLeftIcon, TerminalIcon } from "./icons";

export interface TitlebarProps {
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  rightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

export function Titlebar({
  sidebarCollapsed = false,
  onToggleSidebar,
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
        {onToggleSidebar ? (
          <button
            aria-label="Toggle sidebar"
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-[7px] transition-colors duration-140 enabled:hover:bg-surface-subtle enabled:hover:text-ink disabled:opacity-35 ${
              !sidebarCollapsed ? "bg-surface-subtle text-ink" : "bg-transparent text-muted"
            }`}
            onClick={onToggleSidebar}
            title="Sidebar (⌘B)"
            type="button"
          >
            <PanelLeftIcon size={15} />
          </button>
        ) : null}
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
