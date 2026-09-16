/**
 * 终端自适应主题：不铺底色，跟随终端原生配色。
 * 之前是「强制白底」方案——根节点铺 backgroundColor 让整屏变白，
 * 但 Ink 只给有字符的格子刷底色，空行、行尾留白、flexGrow 弹簧区
 * 都没有字符，终端底色就从这些缝隙里漏出来，永远铺不满。
 * 所以底色直接交给终端：全界面不设 backgroundColor（点缀小色块除外），
 * 前景色只用「深浅终端都可读」的颜色，主文字直接用终端默认前景。
 * 层次靠字重 + muted 灰度来分，而不是靠大面积色块。
 * 全界面不用 dimColor —— faint 会把中性灰压到 ~2:1 对比度，糊成一团。
 */
export interface Theme {
  /**
   * 主文字：不指定（undefined），用终端默认前景，深浅终端都可读。
   * 传给 Ink 的 color 时 undefined 即「不染色」。
   */
  readonly text?: string;
  /** 次级文字：状态行、标签、说明。gray 深浅底都可见。 */
  readonly muted: string;
  /** 交互强调：光标、可选项、命令名。亮蓝深浅底都可读。 */
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
    /** 奶油色：位置层当前步——「你在这」。 */
    readonly cream: string;
    /** 三块浅底共用的字色。 */
    readonly ink: string;
  };
}

/**
 * 前景只用 ANSI 命名色（终端按自身深浅主题保证可读），不用固定 hex：
 * 固定 hex 在深 / 浅某一种终端下必然翻车（黑字黑底或白字白底）。
 * 三枚点缀色是例外：它们是「浅底色块 + 深色字」的小面积出现
 * （键帽、当前步、选中项），色块自带底色、不受终端底影响，不会漏底。
 * 色块面积始终是一个词，不铺面板、不做背景。
 * NO_COLOR 下色块整体退化为普通文字，符号与字重仍完整表达状态。
 */
export const theme = Object.freeze({
  // 主文字不染色：终端默认前景，深浅通吃。
  text: undefined,
  // 中性灰：深底 / 浅底都可见，又不抢主文字。
  muted: "gray",
  // 亮蓝：标准 blue 在深底太暗、标准 cyan 在浅底太淡，bright 蓝两边都可读。
  accent: "blueBright",
  // 品红：bold 品牌字在深浅底都可读。
  brand: "magenta",
  // 标准绿：只用于 ● ✓ 单字符信号，深浅底都可读。
  ok: "green",
  // 标准红：深浅底对比度都在 4:1 左右。
  alert: "red",
  chip: Object.freeze({
    rose: "#F7ADAD",
    aqua: "#CCFBFA",
    cream: "#F7E6CB",
    // 浅底上的字色：近黑，在 #F7ADAD / #CCFBFA / #F7E6CB 上都在 9:1 以上。
    ink: "#1D1D1F",
  }),
} satisfies Theme);
