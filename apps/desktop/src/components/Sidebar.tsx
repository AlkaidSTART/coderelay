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

const ICON_BTN_CLASS =
  "grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-transparent text-muted transition-colors duration-140 enabled:hover:bg-surface-subtle enabled:hover:text-ink disabled:opacity-35";

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
  const newChatActive = isNewChatRouteActive(storeView, activeSessionId);
  const allSessionsActive = isSessionsRouteActive(storeView);

  return (
    <aside
      className={`relative flex min-h-0 flex-col overflow-hidden border-r bg-sidebar transition-[width,opacity,border-color] duration-220 ease-[cubic-bezier(0.2,0,0,1)] ${
        collapsed
          ? "pointer-events-none w-0 shrink-0 basis-0 border-transparent opacity-0"
          : "w-[240px] shrink-0 basis-[240px] border-line opacity-100"
      }`}
    >
      <div className="relative flex items-center justify-between gap-2 px-3 pt-3.5 pb-2.5">
        <WorkspaceDropdown
          isOpen={workspaceDropdownOpen}
          onToggle={handleToggleDropdown}
          currentWorkspace={workspaceInput}
          recentWorkspaces={recentWorkspaces}
          onSelectWorkspace={onSelectWorkspace}
        />

        <div className="flex items-center gap-0.5">
          <button
            aria-label="New"
            className={ICON_BTN_CLASS}
            onClick={onStartNewTask}
            title="New"
            type="button"
          >
            <PlusIcon size={14} />
          </button>
          <button
            aria-label="Refresh"
            className={ICON_BTN_CLASS}
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
        <div className="px-2.5 pt-0.5 pb-1.5">
          <button
            className={`relative flex h-[34px] w-full items-center gap-2 rounded-lg border px-2.5 text-left text-[12.5px] text-ink transition-all duration-140 [&>span]:relative [&>span]:z-1 [&>svg]:relative [&>svg]:z-1 ${
              newChatActive
                ? "border-transparent bg-transparent font-[550] shadow-none"
                : "border-line bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-line-strong hover:bg-surface-subtle"
            }`}
            onClick={onStartNewTask}
            type="button"
          >
            {newChatActive ? (
              <LiquidRouteIndicator layoutId="sidebar-active-indicator" variant="glass" />
            ) : null}
            <PlusIcon size={14} />
            <span>新会话</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pt-1 pb-[18px] [scrollbar-color:rgba(15,23,42,0.12)_transparent] [scrollbar-width:thin]">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              {sessions.slice(0, 12).map((session) => {
                const isActive = isSessionRouteActive(storeView, activeSessionId, session.id);
                return (
                  <button
                    className={`relative block w-full truncate rounded-lg bg-transparent px-2.5 py-[7px] text-left text-[12.5px] transition-all duration-120 ${
                      isActive
                        ? "font-[550] text-ink"
                        : "text-muted-strong hover:bg-black/4 hover:text-ink"
                    }`}
                    key={session.id}
                    onClick={() => onOpenSession(session.id)}
                    title={session.title}
                    type="button"
                  >
                    {isActive ? (
                      <LiquidRouteIndicator layoutId="sidebar-active-indicator" variant="glass" />
                    ) : null}
                    <span className="relative z-1 block truncate">{session.title}</span>
                  </button>
                );
              })}
              {sessions.length > 12 ? (
                <button
                  className={`relative block w-full rounded-[7px] bg-transparent px-2.5 py-1 text-left text-xs transition-colors duration-120 [&>span]:relative [&>span]:z-1 ${
                    allSessionsActive ? "text-ink" : "text-zinc-400 hover:text-ink"
                  }`}
                  onClick={onViewAllSessions}
                  title={`全部 ${sessions.length} 个会话`}
                  type="button"
                >
                  {allSessionsActive ? (
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
                <div className="p-0" key={ws}>
                  <button
                    className="flex w-full items-center gap-[7px] rounded-lg bg-transparent px-2.5 py-1.5 text-left text-xs text-muted transition-all duration-120 hover:bg-black/4 hover:text-ink"
                    onClick={() => onSelectWorkspace(ws)}
                    title={ws}
                    type="button"
                  >
                    <FolderIcon size={14} />
                    <span className="truncate">{workspaceName(ws)}</span>
                  </button>
                </div>
              ))}
          </div>
        </div>
      </LayoutGroup>
    </aside>
  );
}
