/**
 * Config discovery and loading.
 *
 * Lookup order (nearest directory wins, walking up from `cwd`):
 *   1. .coderelay/config.yaml
 *   2. .coderelay/config.yml
 *   3. coderelay.config.yaml
 *   4. coderelay.config.yml
 */

import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
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
