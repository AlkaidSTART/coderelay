export interface Theme {
  readonly bg: string;
  readonly panel: string;
  readonly panelActive: string;
  readonly line: string;
  readonly text: string;
  readonly muted: string;
  readonly dim: string;
  readonly accent: string;
  readonly ok: string;
  readonly warn: string;
}

export const theme = Object.freeze({
  bg: "#080B10",
  panel: "#0E141D",
  panelActive: "#12202A",
  line: "#293747",
  text: "#F5F8FC",
  muted: "#9AA9BD",
  dim: "#7B8CA3",
  accent: "#42E8C6",
  ok: "#70E5A6",
  warn: "#FFB36B",
} satisfies Theme);
