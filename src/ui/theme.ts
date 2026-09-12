export interface Theme {
  readonly bg: string;
  readonly panel: string;
  readonly line: string;
  readonly text: string;
  readonly muted: string;
  readonly dim: string;
  readonly accent: string;
  readonly ok: string;
  readonly warn: string;
}

export const theme = Object.freeze({
  bg: "#050505",
  panel: "#0B0B0C",
  line: "#26262B",
  text: "#F2F2F5",
  muted: "#77777F",
  dim: "#4A4A52",
  accent: "#C8B892",
  ok: "#7FB79B",
  warn: "#C98B7A",
} satisfies Theme);
