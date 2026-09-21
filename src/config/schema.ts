/**
 * Zod schema for `.coderelay/config.yaml`.
 *
 * The schema is the single source of truth for the config shape: the loader
 * validates with it, the CLI types come from `z.infer`, and `doctor` reports
 * validation problems through it.
 */

import { z } from "zod";

import { MODEL_STRENGTHS } from "../models/types";

const isRegExp = (value: string): boolean => {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
};

export const ModelConfigSchema = z.object({
  id: z.string().min(1).describe("Model id passed to the agent CLI"),
  label: z.string().optional(),
  strengths: z.array(z.enum(MODEL_STRENGTHS)).default([]),
  description: z.string().optional(),
  contextWindow: z.number().int().positive().optional(),
  cost: z.number().int().min(1).max(5).optional(),
  default: z.boolean().optional(),
});

export const AgentConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /**
   * Whether the user has explicitly decided this agent's activation state.
   * `enabled` defaults to `true`, so it cannot distinguish "never asked" from
   * "user turned it on"; this flag records that the question was answered.
   */
  activationDecided: z.boolean().default(false),
  /** Override the binary, for example `/opt/homebrew/bin/codex`. */
  command: z.string().optional(),
  /** Models exposed by this agent; empty means the adapter default. */
  models: z.array(ModelConfigSchema).default([]),
  /** Extra argv appended before the prompt. */
  extraArgs: z.array(z.string()).default([]),
  /** Extra environment variables for the child process. */
  env: z.record(z.string(), z.string()).default({}),
});

export const RuleWhenSchema = z.object({
  /** Any of these keywords found in the prompt triggers the rule. */
  keywords: z.array(z.string()).optional(),
  /** Any of these regular expressions matching the prompt triggers the rule. */
  patterns: z
    .array(
      z
        .string()
        .refine(isRegExp, "must be a valid regular expression"),
    )
    .optional(),
  /** Languages (`--lang`) that trigger the rule. */
  languages: z.array(z.string()).optional(),
  /** Any of these globs matching a request file triggers the rule. */
  files: z.array(z.string()).optional(),
  minPromptLength: z.number().int().nonnegative().optional(),
  maxPromptLength: z.number().int().nonnegative().optional(),
});

export const RuleUseSchema = z.object({
  agent: z.string().optional(),
  model: z.string().optional(),
});

export const RouteRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  /** Higher priority rules are evaluated first and win ties. */
  priority: z.number().int().default(0),
  /** Omitted `when` matches every request (catch-all rule). */
  when: RuleWhenSchema.optional(),
  use: RuleUseSchema,
  /** Score bonus applied to the target in `hybrid`/`score` strategies. */
  score: z.number().default(10),
});

export const RoutingWeightsSchema = z.object({
  /** Weight per matched model strength. */
  strength: z.number().default(1),
  /** Multiplier applied to a matched rule's `score` bonus. */
  rule: z.number().default(1),
  /** Bonus for the configured default agent/model. */
  default: z.number().default(2),
  /** Penalty per cost bucket above 1. */
  cost: z.number().default(0.5),
  /** Bonus for models strong at long context when the request is large. */
  context: z.number().default(1),
});

export const ROUTING_MODES = ["local", "manual", "jev"] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];

export const RoutingConfigSchema = z.object({
  mode: z.enum(ROUTING_MODES).default("local"),
  strategy: z.enum(["rules", "score", "hybrid"]).default("hybrid"),
  typesafeApiKey: z.string().optional(),
  typesafeEndpoint: z.string().optional(),
  rules: z.array(RouteRuleSchema).default([]),
  weights: RoutingWeightsSchema.default({
    strength: 1,
    rule: 1,
    default: 2,
    cost: 0.5,
    context: 1,
  }),
});

export const ConfigSchema = z.object({
  /** Bump when the config format changes in a breaking way. */
  version: z.literal(1).default(1),
  /** Agent used when scoring has no clear winner. */
  defaultAgent: z.string().default("codex"),
  /** Optional default model for `defaultAgent`; falls back to the agent default. */
  defaultModel: z.string().optional(),
  agents: z.record(z.string(), AgentConfigSchema).default({}),
  routing: RoutingConfigSchema.default({
    strategy: "hybrid",
    rules: [],
    weights: {
      strength: 1,
      rule: 1,
      default: 2,
      cost: 0.5,
      context: 1,
    },
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type RouteRule = z.infer<typeof RouteRuleSchema>;
export type RuleWhen = z.infer<typeof RuleWhenSchema>;
export type RuleUse = z.infer<typeof RuleUseSchema>;
export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;
export type RoutingWeights = z.infer<typeof RoutingWeightsSchema>;

/** A fully-populated config containing only defaults. */
export function defaultConfig(): Config {
  return ConfigSchema.parse({});
}
