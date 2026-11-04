import type { SessionRecord } from "../types";
import { workspaceName } from "../utils";
import { FolderIcon, PlusIcon, RefreshIcon } from "./icons";
import { WorkspaceDropdown } from "./WorkspaceDropdown";

export interface SidebarProps {
  collapsed: boolean;
  workspaceInput: string;
  recentWorkspaces: string[];
  workspaceDropdownOpen: boolean;
  onToggleWorkspaceDropdown: () => void;
  onSelectWorkspace: (workspace: string) => void;
  loading: boolean;
  onRefreshDiscovery: () => void;
  onStartNewTask: () => void;
  sessions: SessionRecord[];
  activeSessionId: string | null;
  onOpenSession: (sessionId: string) => void;
  onViewAllSessions: () => void;
}

export function Sidebar({
  collapsed,
  workspaceInput,
  recentWorkspaces,
  workspaceDropdownOpen,
  onToggleWorkspaceDropdown,
  onSelectWorkspace,
  loading,
  onRefreshDiscovery,
  onStartNewTask,
  sessions,
  activeSessionId,
  onOpenSession,
  onViewAllSessions,
}: SidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebar-header">
        <WorkspaceDropdown
          isOpen={workspaceDropdownOpen}
          onToggle={onToggleWorkspaceDropdown}
          currentWorkspace={workspaceInput}
          recentWorkspaces={recentWorkspaces}
          onSelectWorkspace={onSelectWorkspace}
        />

        <div className="sidebar-header-actions">
          <button
            aria-label="New"
            className="icon-button"
            onClick={onStartNewTask}
            title="New"
            type="button"
          >
            <PlusIcon size={14} />
          </button>
          <button
            aria-label="Refresh"
            className="icon-button"
            disabled={loading}
            onClick={onRefreshDiscovery}
            title="Refresh"
            type="button"
          >
            <RefreshIcon size={14} />
          </button>
        </div>
      </div>

      <div className="sidebar-scroll">
        <div className="project-tree-section">
          <div className="tree-sub-list">
            {sessions.slice(0, 12).map((session) => (
              <button
                className={`tree-session-link ${activeSessionId === session.id ? "tree-session-link--active" : ""}`}
                key={session.id}
                onClick={() => onOpenSession(session.id)}
                title={session.title}
                type="button"
              >
                <span className="tree-session-title">{session.title}</span>
              </button>
            ))}
            {sessions.length > 12 ? (
              <button
                className="tree-session-more-btn"
                onClick={onViewAllSessions}
                title={`${sessions.length}`}
                type="button"
              >
                ···
              </button>
            ) : null}
          </div>

          {recentWorkspaces
            .filter((ws) => ws !== workspaceInput)
            .slice(0, 4)
            .map((ws) => (
              <div className="tree-project-item" key={ws}>
                <button
                  className="tree-other-project-btn"
                  onClick={() => onSelectWorkspace(ws)}
                  title={ws}
                  type="button"
                >
                  <FolderIcon size={14} />
                  <span className="tree-project-name">{workspaceName(ws)}</span>
                </button>
              </div>
            ))}
        </div>
      </div>
    </aside>
  );
}
