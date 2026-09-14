/**
 * 终端原生主题：界面不铺任何底色，前景色只用 ANSI 命名色。
 * 具体色值交给终端自己的配色方案（深色/浅色主题都不用改代码），
 * 层次靠字重 + muted 灰度来分，而不是靠色块；
 * 全界面不用 dimColor —— faint 会把 gray 压到 ~2:1 对比度，
 * 深浅两套调色板下都糊成一团，正是「发灰发阴」的来源。
 */
export interface Theme {
  /** 主文字：undefined = 不指定颜色，直接继承终端默认前景色。 */
  readonly text: string | undefined;
  /** 次级文字：状态行、标签、说明。 */
  readonly muted: string;
  /** 交互强调：光标、可选项、命令名。 */
  readonly accent: string;
  /** 品牌色：code 前缀。 */
  readonly brand: string;
  /** 单字符状态信号：● 已就绪、✓ 成功。 */
  readonly ok: string;
  /** 失败信号：○ 未安装、× 失败，以及失败回合的输出正文。 */
  readonly alert: string;
}

export const theme = Object.freeze({
  text: undefined,
  muted: "gray",
  accent: "cyan",
  brand: "magenta",
  ok: "green",
  // 失败输出是成段正文，用 brightRed：深底 4.17:1 / 浅底 4.27:1；纯 red 在深底只有 2.85:1。
  alert: "redBright",
} satisfies Theme);
