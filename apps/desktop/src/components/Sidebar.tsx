import { LayoutGroup } from "motion/react";

import {
  isNewChatRouteActive,
  isSessionRouteActive,
  isSessionsRouteActive,
  useNavigationStore,
} from "../stores/navigationStore";
import type { SessionRecord } from "../types";
import { workspaceName } from "../utils";
import { FolderIcon, PlusIcon, RefreshIcon } from "./icons";
import { LiquidRouteIndicator } from "./LiquidRouteIndicator";
import { WorkspaceDropdown } from "./WorkspaceDropdown";

export interface SidebarProps {
  collapsed?: boolean;
  workspaceInput: string;
  recentWorkspaces: string[];
  workspaceDropdownOpen?: boolean;
  onToggleWorkspaceDropdown?: () => void;
  onSelectWorkspace: (workspace: string) => void;
  loading: boolean;
  onRefreshDiscovery: () => void;
  onStartNewTask: () => void;
  sessions: SessionRecord[];
  activeSessionId?: string | null;
  onOpenSession: (sessionId: string) => void;
  onViewAllSessions: () => void;
}

export function Sidebar({
  collapsed: propCollapsed,
  workspaceInput,
  recentWorkspaces,
  workspaceDropdownOpen: propDropdownOpen,
  onToggleWorkspaceDropdown: propToggleDropdown,
  onSelectWorkspace,
  loading,
  onRefreshDiscovery,
  onStartNewTask,
  sessions,
  activeSessionId: propActiveSessionId,
  onOpenSession,
  onViewAllSessions,
}: SidebarProps) {
  const storeView = useNavigationStore((s) => s.view);
  const storeActiveSessionId = useNavigationStore((s) => s.activeSessionId);
  const storeCollapsed = useNavigationStore((s) => s.sidebarCollapsed);
  const storeDropdownOpen = useNavigationStore((s) => s.workspaceDropdownOpen);
  const toggleWorkspaceDropdown = useNavigationStore((s) => s.toggleWorkspaceDropdown);

  const collapsed = propCollapsed ?? storeCollapsed;
  const activeSessionId =
    propActiveSessionId !== undefined ? propActiveSessionId : storeActiveSessionId;
  const workspaceDropdownOpen = propDropdownOpen ?? storeDropdownOpen;
  const handleToggleDropdown = propToggleDropdown ?? toggleWorkspaceDropdown;

  return (
    <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
      <div className="sidebar-header">
        <WorkspaceDropdown
          isOpen={workspaceDropdownOpen}
          onToggle={handleToggleDropdown}
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

      <LayoutGroup id="sidebar-route-group">
        <div className="sidebar-action-bar">
          <button
            className={`new-chat-btn ${isNewChatRouteActive(storeView, activeSessionId) ? "new-chat-btn--active" : ""}`}
            onClick={onStartNewTask}
            type="button"
          >
            {isNewChatRouteActive(storeView, activeSessionId) ? (
              <LiquidRouteIndicator layoutId="sidebar-active-indicator" variant="glass" />
            ) : null}
            <PlusIcon size={14} />
            <span>新会话</span>
          </button>
        </div>

        <div className="sidebar-scroll">
          <div className="project-tree-section">
            <div className="tree-sub-list">
              {sessions.slice(0, 12).map((session) => {
                const isActive = isSessionRouteActive(storeView, activeSessionId, session.id);
                return (
                  <button
                    className={`tree-session-link ${isActive ? "tree-session-link--active" : ""}`}
                    key={session.id}
                    onClick={() => onOpenSession(session.id)}
                    title={session.title}
                    type="button"
                  >
                    {isActive ? (
                      <LiquidRouteIndicator layoutId="sidebar-active-indicator" variant="glass" />
                    ) : null}
                    <span className="tree-session-title">{session.title}</span>
                  </button>
                );
              })}
              {sessions.length > 12 ? (
                <button
                  className={`tree-session-more-btn ${isSessionsRouteActive(storeView) ? "tree-session-more-btn--active" : ""}`}
                  onClick={onViewAllSessions}
                  title={`全部 ${sessions.length} 个会话`}
                  type="button"
                >
                  {isSessionsRouteActive(storeView) ? (
                    <LiquidRouteIndicator layoutId="sidebar-active-indicator" variant="glass" />
                  ) : null}
                  <span>···</span>
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
      </LayoutGroup>
    </aside>
  );
}
