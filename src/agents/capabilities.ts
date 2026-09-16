/**
 * 统一 CLI 能力协议的类型层。
 * 事实来源永远是 CLI 本机配置；`.coderelay/config.yaml` 只做元数据覆盖。
 */
import { z } from "zod";

export const CliCapabilitiesSchema = z.object({
  structuredEvents: z.boolean(),
  nativeResume: z.boolean(),
  nonInteractivePrompt: z.boolean(),
  explicitModel: z.boolean(),
  toolEvents: z.boolean(),
});

export type CliCapabilities = z.infer<typeof CliCapabilitiesSchema>;

export const ProbedModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export type ProbedModel = z.infer<typeof ProbedModelSchema>;

export type ProbeOk = {
  readonly ok: true;
  readonly models: readonly ProbedModel[];
  readonly capabilities: CliCapabilities;
};

export type ProbeFail = {
  readonly ok: false;
  /** 展示给用户的具体原因，禁止静默转默认模型。 */
  readonly reason: string;
};

export type ProbeResult = ProbeOk | ProbeFail;

export function isProbeOk(result: ProbeResult): result is ProbeOk {
  return result.ok;
}

export function validateProbedModels(value: unknown): ProbedModel[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: ProbedModel[] = [];
  for (const item of value) {
    const parsed = ProbedModelSchema.safeParse(item);
    if (!parsed.success) {
      return null;
    }
    out.push(parsed.data);
  }
  return out;
}
