/**
 * 终端原生主题：界面不铺整屏底色，中性文字用 ANSI 命名色跟随终端配色，
 * 点缀色才用固定粉彩值；层次靠字重 + muted 灰度来分，而不是靠大面积色块。
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
  /** 点缀色块：键帽、当前步、选中项。 */
  readonly chip: {
    /** 珊瑚粉：选中项——「这一棒交给它」。 */
    readonly rose: string;
    /** 薄荷青：键帽——「这里能按」。 */
    readonly aqua: string;
    /** 奶油白：位置层当前步——「你在这」。 */
    readonly cream: string;
    /** 三块浅底共用的字色。 */
    readonly ink: string;
  };
}

/**
 * 三枚点缀色只作「浅底色块 + 深色字」的小面积出现（键帽、当前步、选中项）：
 * 这类浅色当纯前景用，在浅色终端上会直接糊掉；底色和字色成对指定后
 * 不管终端是深是浅都自洽。色块面积始终是一个词，不铺面板、不做背景。
 * NO_COLOR 下色块整体退化为普通文字，符号与字重仍完整表达状态。
 */
export const theme = Object.freeze({
  text: undefined,
  muted: "gray",
  accent: "cyan",
  brand: "#F5CBCB",
  // 状态灯与成功信号：暖橙色。
  ok: "#FF9E20",
  // 失败输出是成段正文，用 brightRed：深底 4.17:1 / 浅底 4.27:1；纯 red 在深底只有 2.85:1。
  alert: "redBright",
  chip: Object.freeze({
    rose: "#F7ADAD",
    aqua: "#CCFBFA",
    cream: "#FDF6ED",
    // 浅底上的字色：近黑，在 #F7ADAD / #CCFBFA / #FDF6ED 上都在 9:1 以上。
    ink: "#1D1D1F",
  }),
} satisfies Theme);
