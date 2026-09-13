import type { CliAdapter } from "../models/cli";
import { createAgentAdapter, type AgentAdapter } from "./adapter";

export function createCodexAdapter(cli: CliAdapter): AgentAdapter {
  return createAgentAdapter(cli);
}
