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
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region />
      <div className="titlebar-spacer" data-tauri-drag-region />
      <div className="titlebar-actions">
        <span
          className="status-dot"
          data-tone={statusTone}
          title={runtimeCoreVersion ? `v${runtimeCoreVersion}` : statusTone}
        />
        <button
          aria-label="Agents"
          className={`icon-button ${rightSidebarOpen ? "icon-button--active" : ""}`}
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
