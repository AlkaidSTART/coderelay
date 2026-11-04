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
    <div className="relative min-w-0">
      <button
        className="inline-flex max-w-[164px] items-center gap-1.5 rounded-[7px] bg-transparent px-2 py-[5px] text-[13px] font-[550] tracking-[-0.01em] text-ink transition-colors duration-140 hover:bg-black/[0.045]"
        type="button"
        onClick={onToggle}
        title={currentWorkspace}
      >
        <FolderIcon size={15} />
        <span className="truncate">{workspaceName(currentWorkspace)}</span>
        <ChevronDownIcon size={11} />
      </button>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="absolute top-[calc(100%+6px)] left-0 z-50 min-w-[220px] rounded-[11px] border border-line-strong bg-white p-1.5 shadow-[0_12px_28px_-6px_rgba(0,0,0,0.1),0_4px_10px_-4px_rgba(0,0,0,0.04)]"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            <div
              className="mb-1 flex items-center gap-1.5 truncate rounded-[7px] bg-surface-subtle px-2 py-1.5 font-code text-[11px] text-muted-strong"
              title={currentWorkspace}
            >
              <FolderIcon size={14} />
              <span className="truncate">{currentWorkspace}</span>
            </div>
            {recentWorkspaces.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {recentWorkspaces.map((ws) => (
                  <button
                    key={ws}
                    type="button"
                    className={`flex w-full items-center gap-[7px] rounded-[7px] px-2 py-1.5 text-left text-xs transition-all duration-120 ${
                      ws === currentWorkspace
                        ? "bg-surface-hover font-[550] text-ink"
                        : "bg-transparent text-ink-soft hover:bg-surface-subtle hover:text-ink"
                    }`}
                    onClick={() => onSelectWorkspace(ws)}
                    title={ws}
                  >
                    <FolderIcon size={14} />
                    <span className="truncate">{workspaceName(ws)}</span>
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
