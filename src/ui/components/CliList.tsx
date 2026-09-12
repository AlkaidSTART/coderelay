import { homedir } from "node:os";

import { Box, Text } from "ink";

import { CLI_IDS, type CliId, type DetectedCli } from "../../models/cli";
import { theme } from "../theme";

const CLI_NAMES: Readonly<Record<CliId, string>> = {
  codex: "Codex",
  claude: "Claude Code",
  pi: "Pi",
  omp: "OMP",
};

export interface CliListProps {
  readonly clis: readonly DetectedCli[];
  readonly selectedIndex?: number;
}

export function cliDisplayName(id: CliId): string {
  return CLI_NAMES[id];
}

function abbreviatePath(value: string, maxLength = 46): string {
  const home = homedir();
  const withHome = value === home
    ? "~"
    : value.startsWith(`${home}/`)
      ? `~/${value.slice(home.length + 1)}`
      : value;

  if (withHome.length <= maxLength) {
    return withHome;
  }

  const available = Math.max(1, maxLength - 1);
  const headLength = Math.ceil(available / 2);
  const tailLength = Math.floor(available / 2);
  return `${withHome.slice(0, headLength)}…${withHome.slice(-tailLength)}`;
}

function statusPath(cli: DetectedCli): string {
  return cli.available ? abbreviatePath(cli.path) : "未检测到";
}

export function CliList({ clis, selectedIndex = 0 }: CliListProps) {
  const ordered = CLI_IDS.map((id) => clis.find((cli) => cli.id === id)).filter(
    (cli): cli is DetectedCli => Boolean(cli),
  );

  return (
    <Box flexDirection="column" paddingX={2}>
      {ordered.map((cli, index) => {
        const selected = index === selectedIndex;
        const indicator = cli.available ? "●" : "○";
        const indicatorColor = cli.available ? theme.ok : theme.muted;
        const nameColor = selected ? theme.text : theme.muted;
        const version = cli.version ?? "—";

        return (
          <Box key={cli.id} flexDirection="row">
            <Text color={selected ? theme.accent : theme.muted}>
              {selected ? "❯" : " "}
            </Text>
            <Text> </Text>
            <Text color={indicatorColor}>{indicator}</Text>
            <Text> </Text>
            <Box width={14}>
              <Text bold={selected} color={nameColor} wrap="truncate-end">
                {cliDisplayName(cli.id)}
              </Text>
            </Box>
            <Box width={20}>
              <Text color={selected ? theme.text : theme.dim} wrap="truncate-end">
                {version}
              </Text>
            </Box>
            <Text color={theme.dim} wrap="truncate-end">
              {statusPath(cli)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
