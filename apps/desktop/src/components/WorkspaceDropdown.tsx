import { AnimatePresence, motion } from "motion/react";

import { workspaceName } from "../utils";
import { ChevronDownIcon, FolderIcon } from "./icons";

export interface WorkspaceDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  currentWorkspace: string;
  recentWorkspaces: string[];
  onSelectWorkspace: (workspace: string) => void;
}

export function WorkspaceDropdown({
  isOpen,
  onToggle,
  currentWorkspace,
  recentWorkspaces,
  onSelectWorkspace,
}: WorkspaceDropdownProps) {
  return (
    <div className="brand-dropdown-wrap">
      <button
        className="brand-lockup-btn"
        type="button"
        onClick={onToggle}
        title={currentWorkspace}
      >
        <FolderIcon size={15} />
        <span className="brand-title">{workspaceName(currentWorkspace)}</span>
        <ChevronDownIcon size={11} />
      </button>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="workspace-dropdown"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            <div className="workspace-dropdown-current" title={currentWorkspace}>
              <FolderIcon size={14} />
              <span>{currentWorkspace}</span>
            </div>
            {recentWorkspaces.length > 0 ? (
              <div className="workspace-dropdown-list">
                {recentWorkspaces.map((ws) => (
                  <button
                    key={ws}
                    type="button"
                    className={`workspace-dropdown-item ${ws === currentWorkspace ? "workspace-dropdown-item--active" : ""}`}
                    onClick={() => onSelectWorkspace(ws)}
                    title={ws}
                  >
                    <FolderIcon size={14} />
                    <span>{workspaceName(ws)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
