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

/** Reduce raw `--version` output to the bare version token when one is present. */
function compactVersion(version: string | null): string {
  if (!version) {
    return "—";
  }

  const match = version.match(/\d+(?:\.\d+)+/);
  return match ? match[0] : version;
}

function versionLabel(version: string | null): string {
  const compact = compactVersion(version);
  return compact === "—" ? "版本未知" : `v${compact}`;
}

function detailLine(cli: DetectedCli): string {
  if (!cli.available) {
    return `PATH 里找不到 ${cli.bin}`;
  }

  return `${versionLabel(cli.version)}  ·  ${abbreviatePath(cli.path)}`;
}

export function CliList({ clis, selectedIndex = 0 }: CliListProps) {
  const ordered = CLI_IDS.map((id) => clis.find((cli) => cli.id === id)).filter(
    (cli): cli is DetectedCli => Boolean(cli),
  );

  return (
    <Box flexDirection="column" paddingX={2}>
      <Box marginBottom={1}>
        <Text bold color={theme.text}>
          这一棒交给谁？
        </Text>
      </Box>

      {ordered.map((cli, index) => {
        const selected = index === selectedIndex;
        const indicator = cli.available ? "●" : "○";
        const status = cli.available ? "已就绪" : "未检测到";

        return (
          <Box
            key={cli.id}
            flexDirection="column"
            marginBottom={index === ordered.length - 1 ? 0 : 1}
          >
            <Box
              width="100%"
              flexDirection="row"
              backgroundColor={selected ? theme.panelActive : undefined}
            >
              <Text color={selected ? theme.accent : theme.line}>
                {selected ? "▌" : "│"}
              </Text>
              <Text> </Text>
              <Text color={selected ? theme.text : theme.dim}>
                {String(index + 1).padStart(2, "0")}
              </Text>
              <Text>{"  "}</Text>
              <Box width={16}>
                <Text
                  bold={selected}
                  color={selected ? theme.text : theme.muted}
                  wrap="truncate-end"
                >
                  {cliDisplayName(cli.id)}
                </Text>
              </Box>
              <Box flexGrow={1} />
              <Text color={cli.available ? theme.ok : theme.muted}>
                {indicator}
              </Text>
              <Text color={selected ? theme.text : theme.muted}>
                {" "}
                {status}
              </Text>
            </Box>
            <Box width="100%" paddingLeft={7}>
              <Text color={theme.dim} wrap="truncate-end">
                {detailLine(cli)}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
