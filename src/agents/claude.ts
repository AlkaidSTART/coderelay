import type { CliAdapter } from "../models/cli";
import { createAgentAdapter, type AgentAdapter } from "./adapter";

export function createClaudeAdapter(cli: CliAdapter): AgentAdapter {
  return createAgentAdapter(cli);
}
