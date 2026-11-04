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
          {agents.map((agent) => {
            const isSelected = selectedAgentId === agent.id;
            const toneClass = agent.available
              ? isSelected
                ? "bg-[#3b6e5c]/[0.12] text-[#24493b]"
                : "bg-transparent text-[#3b6e5c] hover:bg-[#3b6e5c]/[0.07] hover:text-[#2a5445]"
              : isSelected
                ? "bg-[#9e5350]/[0.12] text-[#783734]"
                : "bg-transparent text-[#9e5350] hover:bg-[#9e5350]/[0.07] hover:text-[#823e3b]";

            return (
              <button
                className={`relative flex w-full items-center rounded-lg px-2.5 py-2 text-left transition-colors duration-140 ${toneClass}`}
                key={agent.id}
                onClick={() => onSelectAgent(agent)}
                title={agent.version ?? agent.command}
                type="button"
              >
                <span className="flex min-w-0 flex-col">
                  <strong className="truncate text-xs font-medium">{agent.label}</strong>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
