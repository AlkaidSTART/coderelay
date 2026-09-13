export interface Theme {
  /** 纯白画布：整个界面只有一层白，大面积永远是白底黑字。 */
  readonly bg: string;
  /** 玻璃板：位置层、输入框，与 bg 同为纯白，靠圆角描边浮起。 */
  readonly panel: string;
  /** 系统蓝：只标可交互的东西（选中标记、聚焦输入框、Spinner）。 */
  readonly accent: string;
  readonly pinkInk: string;
  readonly text: string;
  readonly muted: string;
  /** 只用在 bg / panel 上。 */
  readonly dim: string;
  /** 装饰性轨道与分隔线（systemGray4）。 */
  readonly line: string;
  /** 玻璃描边（位置层、未聚焦输入框，systemGray3）。 */
  readonly edge: string;
  /** 系统绿：只做单字符信号（● 已就绪、✓ 成功），旁边必有文字。 */
  readonly ok: string;
  readonly alert: string;
}

export const theme = Object.freeze({
  bg: "#FFFFFF",
  panel: "#FFFFFF",
  accent: "#0066CC",
  pinkInk: "#C81E4E",
  text: "#1D1D1F",
  muted: "#55555A",
  dim: "#69696E",
  line: "#D1D1D6",
  edge: "#C7C7CC",
  ok: "#248A3D",
  alert: "#D70015",
} satisfies Theme);
