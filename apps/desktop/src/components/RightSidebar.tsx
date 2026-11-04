import type { AgentEntry } from "../types";

export interface RightSidebarProps {
  open: boolean;
  agents: AgentEntry[];
  selectedAgentId: string;
  onSelectAgent: (agent: AgentEntry) => void;
}

export function RightSidebar({
  open,
  agents,
  selectedAgentId,
  onSelectAgent,
}: RightSidebarProps) {
  return (
    <aside
      className={`relative flex min-h-0 flex-col overflow-hidden border-l bg-sidebar transition-[width,opacity] duration-220 ease-[cubic-bezier(0.2,0,0,1)] ${
        open
          ? "w-[220px] shrink-0 basis-[220px] border-line opacity-100"
          : "pointer-events-none w-0 shrink-0 basis-0 border-l-0 border-transparent opacity-0"
      }`}
      aria-label="Agents"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pt-1 pb-[18px] [scrollbar-color:rgba(15,23,42,0.12)_transparent] [scrollbar-width:thin]">
        <div className="flex flex-col gap-[3px] pt-2.5">
          {agents.map((agent) => (
            <button
              className={`relative flex w-full items-center gap-[9px] rounded-lg px-2.5 py-2 text-left transition-colors duration-140 ${
                selectedAgentId === agent.id
                  ? "bg-zinc-200 text-ink"
                  : "bg-transparent text-ink-soft hover:bg-zinc-900/4 hover:text-ink"
              }`}
              key={agent.id}
              onClick={() => onSelectAgent(agent)}
              title={agent.version ?? agent.command}
              type="button"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  agent.available ? "bg-success" : "bg-zinc-300"
                }`}
              />
              <span className="flex min-w-0 flex-col">
                <strong className="truncate text-xs font-medium">{agent.label}</strong>
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
