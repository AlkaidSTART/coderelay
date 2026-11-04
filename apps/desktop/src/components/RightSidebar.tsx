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
      className={`sidebar sidebar--right ${open ? "sidebar--right-open" : "sidebar--right-collapsed"}`}
      aria-label="Agents"
    >
      <div className="sidebar-scroll">
        <div className="agent-list">
          {agents.map((agent) => (
            <button
              className={`agent-row ${selectedAgentId === agent.id ? "agent-row--selected" : ""}`}
              key={agent.id}
              onClick={() => onSelectAgent(agent)}
              title={agent.version ?? agent.command}
              type="button"
            >
              <span
                className={`agent-status ${agent.available ? "agent-status--ready" : ""}`}
              />
              <span className="agent-copy">
                <strong>{agent.label}</strong>
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
