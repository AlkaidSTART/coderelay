/**
 * 固定浅色主题：整屏白底 + 固定深色字，不跟随终端配色。
 * 底色由根节点铺满（见 App.tsx）；前景色必须逐个显式指定——
 * Ink 的 backgroundColor 会经 context 继承给后代 Text，前景色不会，
 * 漏掉一处就会在深色终端里变成白字白底。
 * 层次靠字重 + muted 灰度来分，而不是靠大面积色块。
 * 全界面不用 dimColor —— faint 会把中性灰压到 ~2:1 对比度，糊成一团。
 */
export interface Theme {
  /** 整屏底色。 */
  readonly bg: string;
  /** 主文字：白底上的近黑。 */
  readonly text: string;
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
    /** 奶油色：位置层当前步——「你在这」；白底上仍要看得见边界。 */
    readonly cream: string;
    /** 三块浅底共用的字色。 */
    readonly ink: string;
  };
}

/**
 * 三枚点缀色只作「浅底色块 + 深色字」的小面积出现（键帽、当前步、选中项）：
 * 色块保持浅粉彩、字色统一近黑，白底上才有边界。
 * 色块面积始终是一个词，不铺面板、不做背景。
 * NO_COLOR 下色块整体退化为普通文字，符号与字重仍完整表达状态。
 */
export const theme = Object.freeze({
  bg: "#FFFFFF",
  // 白底上的近黑：对比度 16:1。
  text: "#1D1D1F",
  // 中性灰：白底 8.3:1，够暗又不抢主文字。
  muted: "#55555A",
  // 强调蓝：白底 5.6:1。
  accent: "#0066CC",
  // 品牌红：白底 6.4:1。
  brand: "#C81E4E",
  // 状态灯与成功信号：白底 5.1:1 的深绿。
  ok: "#0B7A3E",
  // 失败输出是成段正文：白底 5.3:1 的深红。
  alert: "#D70015",
  chip: Object.freeze({
    rose: "#F7ADAD",
    aqua: "#CCFBFA",
    cream: "#F7E6CB",
    // 浅底上的字色：近黑，在 #F7ADAD / #CCFBFA / #F7E6CB 上都在 9:1 以上。
    ink: "#1D1D1F",
  }),
} satisfies Theme);
