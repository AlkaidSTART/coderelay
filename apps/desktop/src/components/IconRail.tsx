import { motion } from "motion/react";

import type { WorkspaceView } from "../types";
import {
  HistoryIcon,
  HomeIcon,
  PanelLeftIcon,
  PlusIcon,
  SettingsIcon,
} from "./icons";

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
            <motion.div
              className="rail-action-bg"
              layoutId="rail-active-pill"
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
            />
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
            <motion.div
              className="rail-action-bg"
              layoutId="rail-active-pill"
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
            />
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
            <motion.div
              className="rail-action-bg"
              layoutId="rail-active-pill"
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
            />
          ) : null}
          <SettingsIcon />
        </button>
      </div>
    </nav>
  );
}
