import {
  getCliAdapters,
  type CliAdapterOptions,
} from "../agents/cli-adapters";
import { loadConfig } from "../config/loader";
import type { Config } from "../config/schema";
import { CLI_IDS, type CliId, type DetectedCli } from "../models/cli";
import { scanCodingClis, type ScannerOptions } from "../scanner/cli-scanner";

const AGENT_LABELS: Readonly<Record<CliId, string>> = {
  codex: "Codex",
  claude: "Claude Code",
  pi: "Pi",
  omp: "OMP",
};

export interface AgentListEntry {
  readonly id: CliId;
  readonly label: string;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly available: boolean;
  readonly command: string;
  readonly path: string;
  readonly version: string | null;
  readonly configDir: string;
  readonly models: readonly string[];
}

export interface AgentCommandOptions {
  readonly cwd?: string;
  readonly configPath?: string;
  readonly config?: Config;
  readonly scanner?: ScannerOptions;
}

export interface AgentCommandDependencies {
  readonly scan?: (options?: ScannerOptions) => Promise<DetectedCli[]>;
  readonly write?: (text: string) => void;
  readonly adapters?: CliAdapterOptions;
}

export function buildAgentList(
  config: Config,
  detected: readonly DetectedCli[],
  adapterOptions: CliAdapterOptions = {},
): AgentListEntry[] {
  const adapters = getCliAdapters(adapterOptions);
  const detectedById = new Map(detected.map((item) => [item.id, item]));

  return CLI_IDS.map((id) => {
    const detectedCli = detectedById.get(id);
    const agentConfig = config.agents[id];
    const command = agentConfig?.command?.trim() || detectedCli?.path || "";

    return {
      id,
      label: AGENT_LABELS[id],
      enabled: agentConfig?.enabled ?? true,
      isDefault: config.defaultAgent === id,
      available: detectedCli?.available ?? false,
      command: command || adapters[id].bin,
      path: detectedCli?.path ?? "",
      version: detectedCli?.version ?? null,
      configDir: adapters[id].configDir,
      models: agentConfig?.models.map((model) => model.id) ?? [],
    };
  });
}

export function formatAgentList(entries: readonly AgentListEntry[]): string {
  return entries
    .map((entry) => {
      const defaultMarker = entry.isDefault ? " default" : "";
      const enabledMarker = entry.enabled ? "enabled" : "disabled";
      const availability = entry.available
        ? entry.version ?? "available"
        : "not found";
      const models =
        entry.models.length > 0 ? entry.models.join(", ") : "(adapter default)";

      return [
        `${entry.label} (${entry.id}) [${enabledMarker}${defaultMarker}]`,
        `  status: ${availability}`,
        `  command: ${entry.command}`,
        entry.path ? `  path: ${entry.path}` : null,
        `  config: ${entry.configDir}`,
        `  models: ${models}`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");
    })
    .join("\n\n");
}

export async function runAgentsCommand(
  options: AgentCommandOptions = {},
  dependencies: AgentCommandDependencies = {},
): Promise<number> {
  const write = dependencies.write ?? ((text: string) => process.stdout.write(text));
  const scan = dependencies.scan ?? scanCodingClis;

  try {
    const loaded =
      options.config === undefined
        ? await loadConfig({ cwd: options.cwd, path: options.configPath })
        : { config: options.config };
    const detected = await scan(options.scanner);
    const entries = buildAgentList(
      loaded.config,
      detected,
      dependencies.adapters,
    );
    write(`${formatAgentList(entries)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    write(`coderelay agents: ${message}\n`);
    return 1;
  }
}
