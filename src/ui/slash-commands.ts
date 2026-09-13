export interface SlashCommand {
  readonly name: string;
  readonly description: string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: "/model", description: "切换 agent，会话上下文保留" },
  { name: "/new", description: "开始新会话，清空上下文" },
  { name: "/help", description: "显示可用命令" },
];

export const SLASH_HELP = SLASH_COMMANDS.map(
  (command) => `${command.name} ${command.description}`,
).join(" · ");

/** 当前输入命中的命令（用于输入 `/` 时的实时菜单）。 */
export function matchSlashCommands(
  input: string,
): readonly SlashCommand[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return [];
  }
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(trimmed));
}

/** 精确匹配一条命令；找不到返回 undefined。 */
export function findSlashCommand(
  input: string,
): SlashCommand | undefined {
  const trimmed = input.trim();
  return SLASH_COMMANDS.find((command) => command.name === trimmed);
}
