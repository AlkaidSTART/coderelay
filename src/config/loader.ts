/**
 * Config discovery and loading.
 *
 * Lookup order (nearest directory wins, walking up from `cwd`):
 *   1. .coderelay/config.yaml
 *   2. .coderelay/config.yml
 *   3. coderelay.config.yaml
 *   4. coderelay.config.yml
 */

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { ConfigSchema, defaultConfig, type Config } from "./schema";

export const CONFIG_DIR = ".coderelay";
export const CONFIG_FILE_NAMES = [
  `${CONFIG_DIR}/config.yaml`,
  `${CONFIG_DIR}/config.yml`,
  "coderelay.config.yaml",
  "coderelay.config.yml",
] as const;

export class ConfigError extends Error {
  readonly path?: string;

  constructor(
    message: string,
    options: { path?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ConfigError";
    this.path = options.path;
  }
}

export interface LoadConfigOptions {
  /** Directory to start the search from (defaults to `process.cwd()`). */
  cwd?: string;
  /** Explicit config file; skips discovery and errors when missing. */
  path?: string;
  /** Return defaults instead of throwing when no config file is found. */
  allowMissing?: boolean;
}

export interface LoadedConfig {
  config: Config;
  /** Absolute path of the loaded file, or `null` when defaults were used. */
  path: string | null;
  /** Directory the search started from. */
  cwd: string;
  /** Defaults that were applied because the file omitted them. */
  usedDefaults: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Walk up from `startDir` looking for a config file. */
export async function findConfigPath(startDir: string): Promise<string | null> {
  let dir = resolve(startDir);

  while (true) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = join(dir, name);
      if (await Bun.file(candidate).exists()) {
        return candidate;
      }
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/** Load and validate the config, falling back to defaults when allowed. */
export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<LoadedConfig> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const path = options.path ? resolve(options.path) : await findConfigPath(cwd);

  if (!path) {
    if (options.allowMissing === false) {
      throw new ConfigError(
        `no config file found from ${cwd}; create ${CONFIG_DIR}/config.yaml`,
      );
    }

    return { config: defaultConfig(), path: null, cwd, usedDefaults: true };
  }

  if (!(await Bun.file(path).exists())) {
    throw new ConfigError(`config file not found: ${path}`, { path });
  }

  const raw = await Bun.file(path).text();
  let parsed: unknown;
  try {
    parsed = parseYaml(raw) ?? {};
  } catch (error) {
    throw new ConfigError(`invalid YAML in ${path}: ${errorMessage(error)}`, {
      path,
      cause: error,
    });
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(
      `invalid config in ${path}:\n${z.prettifyError(result.error)}`,
      { path, cause: result.error },
    );
  }

  return { config: result.data, path, cwd, usedDefaults: false };
}

/** Absolute path of the config file `loadConfig` would use, if any. */
export async function resolveConfigPath(
  cwd = process.cwd(),
): Promise<string | null> {
  return findConfigPath(cwd);
}

/** Directory that holds the config file (created on demand by `init`). */
export function configDirFor(cwd = process.cwd()): string {
  return join(resolve(cwd), CONFIG_DIR);
}

/** Global directory that holds user-level config and session data (~/.coderelay). */
export function globalConfigDir(homeDir = homedir()): string {
  return join(homeDir, CONFIG_DIR);
}

/** One CLI's activation choice, as confirmed by the user in the TUI. */
export interface ActivationDecision {
  readonly cliId: string;
  readonly enabled: boolean;
}

export interface SaveActivationOptions {
  /** Directory the default config path is derived from. */
  cwd?: string;
  /** Explicit config file to update; defaults to `<cwd>/.coderelay/config.yaml`. */
  path?: string | null;
}

/** Path `saveActivationDecisions` writes to when no explicit path is given. */
export function defaultConfigPath(cwd = process.cwd()): string {
  return join(resolve(cwd), CONFIG_FILE_NAMES[0]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Persist activation choices, touching only the activation fields.
 *
 * The raw YAML is merged into rather than re-serialized from the parsed
 * `Config`, so models, routing, commands, env and any keys this version of the
 * schema does not know about survive the write untouched. Comments are not
 * preserved.
 */
export async function saveActivationDecisions(
  decisions: readonly ActivationDecision[],
  options: SaveActivationOptions = {},
): Promise<string> {
  const path = options.path
    ? resolve(options.path)
    : defaultConfigPath(options.cwd);

  let raw: Record<string, unknown> = {};
  const file = Bun.file(path);
  if (await file.exists()) {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = parseYaml(text);
    } catch (error) {
      throw new ConfigError(`invalid YAML in ${path}: ${errorMessage(error)}`, {
        path,
        cause: error,
      });
    }
    if (parsed !== null && parsed !== undefined) {
      if (!isRecord(parsed)) {
        throw new ConfigError(`${path} must contain a YAML mapping`, { path });
      }
      raw = parsed;
    }
  }

  const agents = isRecord(raw.agents) ? raw.agents : {};
  for (const decision of decisions) {
    const existing = agents[decision.cliId];
    agents[decision.cliId] = {
      ...(isRecord(existing) ? existing : {}),
      enabled: decision.enabled,
      activationDecided: true,
    };
  }
  raw.agents = agents;

  try {
    await mkdir(dirname(path), { recursive: true });
    // The `yaml` package emits block style; `Bun.YAML.stringify` writes flow
    // style (one dense line), which is valid but unreadable for a file users
    // are expected to hand-edit.
    await Bun.write(path, stringifyYaml(raw));
  } catch (error) {
    throw new ConfigError(`failed to write config to ${path}: ${errorMessage(error)}`, {
      path,
      cause: error,
    });
  }

  return path;
}
