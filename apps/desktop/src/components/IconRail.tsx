import { LayoutGroup } from "motion/react";

import type { WorkspaceView } from "../types";
import {
  HistoryIcon,
  HomeIcon,
  PanelLeftIcon,
  PlusIcon,
  SettingsIcon,
} from "./icons";
import { LiquidRouteIndicator } from "./LiquidRouteIndicator";

export interface IconRailProps {
  currentView: WorkspaceView;
  onToggleSidebar: () => void;
  onSelectView: (view: WorkspaceView) => void;
  onStartNewTask: () => void;
}

export function IconRail({
  currentView,
  onToggleSidebar,
  onSelectView,
  onStartNewTask,
}: IconRailProps) {
  return (
    <LayoutGroup id="rail-route-group">
      <nav className="icon-rail" aria-label="Navigation">
        <div className="rail-nav">
          <button
            aria-label="Toggle sidebar"
            className="rail-action rail-action--toggle"
            onClick={onToggleSidebar}
            title="⌘B"
            type="button"
          >
            <PanelLeftIcon size={17} />
          </button>
          <button
            aria-label="Workspace"
            className={`rail-action ${currentView === "workspace" ? "rail-action--active" : ""}`}
            onClick={() => onSelectView("workspace")}
            title="Workspace"
            type="button"
          >
            {currentView === "workspace" ? (
              <LiquidRouteIndicator layoutId="rail-active-pill" variant="dark" />
            ) : null}
            <HomeIcon />
          </button>
          <button
            aria-label="Sessions"
            className={`rail-action ${currentView === "sessions" ? "rail-action--active" : ""}`}
            onClick={() => onSelectView("sessions")}
            title="Sessions"
            type="button"
          >
            {currentView === "sessions" ? (
              <LiquidRouteIndicator layoutId="rail-active-pill" variant="dark" />
            ) : null}
            <HistoryIcon />
          </button>
          <button
            aria-label="New"
            className="rail-action"
            onClick={onStartNewTask}
            title="New"
            type="button"
          >
            <PlusIcon size={16} />
          </button>
        </div>
        <div className="rail-footer">
          <button
            aria-label="Settings"
            className={`rail-action ${currentView === "config" ? "rail-action--active" : ""}`}
            onClick={() => onSelectView("config")}
            title="Settings"
            type="button"
          >
            {currentView === "config" ? (
              <LiquidRouteIndicator layoutId="rail-active-pill" variant="dark" />
            ) : null}
            <SettingsIcon />
          </button>
        </div>
      </nav>
    </LayoutGroup>
  );
}
