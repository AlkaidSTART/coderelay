Skip to main content
⌘J































cli-detection-guide.md
Files
AI Coding CLI 检测与接入指南（TypeScript）
用于在自建 CLI 中自动扫描并接入以下工具：

CLI

命令

说明

Codex CLI

codex

OpenAI 终端编码代理

Claude Code

claude

Anthropic 官方编码代理

Pi

pi

earendil-works 最小 harness

OMP (Oh My Pi)

omp

Pi 的增强 fork，功能最全

1. 统一检测接口（建议）
export type DetectedCli = {
  id: "codex" | "claude" | "pi" | "omp";
  bin: string;
  path: string;
  version: string | null;
  available: boolean;
};

export type CliId = DetectedCli["id"];
2. 各 CLI 检测要点
2.1 Codex CLI (codex)
项

值

二进制名

codex

版本命令

codex --version 或 codex -V

典型输出

codex-cli 0.139.0

配置目录

~/.codex/

常见路径

PATH、~/.local/bin/codex、npm global bin

安装来源

# 官方脚本
curl -fsSL https://chatgpt.com/codex/install.sh | sh

# npm
npm i -g @openai/codex

# Homebrew
brew install --cask codex
接入命令

codex                    # 交互
codex "prompt"           # 带初始 prompt
codex exec "prompt"      # 非交互
2.2 Claude Code (claude)
项

值

二进制名

claude

版本命令

claude --version

典型输出

2.1.211 (Claude Code)

健康检查

claude doctor

配置目录

~/.claude/（可用 CLAUDE_CONFIG_DIR 覆盖）

运行时环境变量（判断「是否在 Claude Code 内」）

变量

含义

CLAUDECODE=1

Claude Code 启动的 shell 子进程

CLAUDE_CODE_CHILD_SESSION=1

Bash/PowerShell 工具等子进程

Windows 兜底路径

%USERPROFILE%\.local\bin\claude.exe

%APPDATA%\npm\claude.cmd

%USERPROFILE%\.bun\bin\claude.exe

安装来源

# macOS / Linux
curl -fsSL https://claude.ai/install.sh | bash

# Windows PowerShell
irm https://claude.ai/install.ps1 | iex

# npm
npm i -g @anthropic-ai/claude-code
接入命令

claude                   # 交互
claude -p "prompt"       # 非交互 / print
2.3 Pi (pi)
项

值

二进制名

pi

版本命令

pi --version 或 pi -v

配置目录

~/.pi/agent/

运行时 env

PI_CODING_AGENT=true（启动后设置，子进程可识别）

安装来源

curl -fsSL https://pi.dev/install.sh | sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
brew install pi-coding-agent
接入命令

pi                       # 交互
pi -p "prompt"           # 非交互
pi -p "..." --json       # JSON 事件流
pi --mode rpc            # RPC
2.4 OMP / Oh My Pi (omp)
项

值

二进制名

omp

版本命令

omp --version 或 omp -v

配置目录

~/.omp/ 或 ~/.omp/agent/

安装来源

# macOS / Linux
curl -fsSL https://omp.sh/install | sh

# Windows
irm https://omp.sh/install.ps1 | iex

# Homebrew
brew install can1357/tap/omp

# Bun
bun install -g @oh-my-pi/pi-coding-agent
接入命令

omp                      # 交互
omp -p "prompt"          # 非交互 / print
omp --mode json          # JSON
omp --mode rpc           # RPC
3. TypeScript 检测实现
3.1 依赖
仅用 Node 内置模块即可：

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);
3.2 解析 PATH 中的可执行文件
async function resolveOnPath(bin: string): Promise<string | null> {
  const isWin = process.platform === "win32";
  const whichCmd = isWin ? "where" : "which";

  try {
    const { stdout } = await execFileAsync(whichCmd, [bin], {
      timeout: 3000,
      windowsHide: true,
    });
    const first = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return first ?? null;
  } catch {
    return null;
  }
}
3.3 版本探测
async function getVersion(binPath: string): Promise<string | null> {
  for (const args of [["--version"], ["-v"], ["-V"]]) {
    try {
      const { stdout, stderr } = await execFileAsync(binPath, args, {
        timeout: 5000,
        windowsHide: true,
      });
      const text = (stdout || stderr).trim();
      if (text) {
        // 取第一行，去掉多余空白
        return text.split(/\r?\n/)[0].trim();
      }
    } catch {
      // try next flag
    }
  }
  return null;
}
3.4 Windows 兜底路径（Claude）
async function windowsClaudeFallbacks(): Promise<string | null> {
  if (process.platform !== "win32") return null;

  const home = os.homedir();
  const candidates = [
    path.join(home, ".local", "bin", "claude.exe"),
    path.join(process.env.APPDATA ?? "", "npm", "claude.cmd"),
    path.join(home, ".bun", "bin", "claude.exe"),
  ];

  for (const p of candidates) {
    try {
      await access(p, constants.X_OK);
      return p;
    } catch {
      // continue
    }
  }
  return null;
}
3.5 完整扫描
const CLI_DEFS: Array<{
  id: CliId;
  bin: string;
  extraResolve?: () => Promise<string | null>;
}> = [
  { id: "codex", bin: "codex" },
  {
    id: "claude",
    bin: "claude",
    extraResolve: windowsClaudeFallbacks,
  },
  { id: "pi", bin: "pi" },
  { id: "omp", bin: "omp" },
];

export async function scanCodingClis(): Promise<DetectedCli[]> {
  const results: DetectedCli[] = [];

  for (const def of CLI_DEFS) {
    let resolved = await resolveOnPath(def.bin);
    if (!resolved && def.extraResolve) {
      resolved = await def.extraResolve();
    }

    if (!resolved) {
      results.push({
        id: def.id,
        bin: def.bin,
        path: "",
        version: null,
        available: false,
      });
      continue;
    }

    const version = await getVersion(resolved);
    results.push({
      id: def.id,
      bin: def.bin,
      path: resolved,
      version,
      available: true,
    });
  }

  return results;
}
3.6 使用示例
const list = await scanCodingClis();

for (const cli of list) {
  if (cli.available) {
    console.log(`✓ ${cli.id}: ${cli.version} @ ${cli.path}`);
  } else {
    console.log(`✗ ${cli.id}: not found`);
  }
}

// 只取可用的
const ready = list.filter((c) => c.available);
4. 启动 / 接入（spawn）
4.1 交互模式（继承 stdio）
import { spawn } from "node:child_process";

export function launchInteractive(
  binPath: string,
  args: string[] = [],
  cwd = process.cwd()
) {
  const child = spawn(binPath, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32", // Windows 上 .cmd 需要 shell
  });
  return child;
}

// 示例
// launchInteractive(codexPath);           // codex
// launchInteractive(claudePath);          // claude
// launchInteractive(piPath);              // pi
// launchInteractive(ompPath);             // omp
4.2 非交互 / 带 prompt
export function launchWithPrompt(
  id: CliId,
  binPath: string,
  prompt: string,
  opts?: { cwd?: string; extraArgs?: string[] }
) {
  const cwd = opts?.cwd ?? process.cwd();
  const extra = opts?.extraArgs ?? [];

  // 各 CLI 非交互参数略有不同
  const argsById: Record<CliId, string[]> = {
    codex: [prompt, ...extra], // 或 ["exec", prompt]
    claude: ["-p", prompt, ...extra],
    pi: ["-p", prompt, ...extra],
    omp: ["-p", prompt, ...extra],
  };

  return spawn(binPath, argsById[id], {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
}
4.3 捕获输出（脚本场景）
export async function runOnce(
  binPath: string,
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number }
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const { stdout, stderr } = await execFileAsync(binPath, args, {
    cwd: opts?.cwd,
    timeout: opts?.timeoutMs ?? 120_000,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  return { stdout, stderr, code: 0 };
}
5. 运行时「被对方感应」（可选）
若你的 CLI 会作为子进程被这些 agent 调用，可检测对方注入的环境变量：

export function detectHostAgent(): "claude" | "pi" | null {
  if (process.env.CLAUDECODE === "1" || process.env.CLAUDE_CODE_CHILD_SESSION === "1") {
    return "claude";
  }
  if (process.env.PI_CODING_AGENT === "true" || process.env.PI_CODING_AGENT === "1") {
    return "pi";
  }
  return null;
}
Codex / OMP 目前没有同样稳定的公开「宿主标记」env，以 PATH 扫描为主即可。

6. 速查表
CLI

bin

版本

交互

非交互

配置目录

Codex

codex

--version / -V

codex

codex exec "..." / codex "..."

~/.codex

Claude

claude

--version

claude

claude -p "..."

~/.claude

Pi

pi

--version / -v

pi

pi -p "..."

~/.pi/agent

OMP

omp

--version / -v

omp

omp -p "..."

~/.omp

7. 注意事项
超时：版本探测建议 3–5s，避免卡死。

Windows：where 可能返回多行；取第一行；.cmd 启动建议 shell: true。

PATH 未刷新：刚安装后当前 shell 可能找不到命令，可提示用户开新终端，或扫 ~/.local/bin。

鉴权：检测到不等于已登录；首次运行通常要浏览器 OAuth 或 API Key。

并行扫描：四个 CLI 可 Promise.all 并行，加快启动。

export async function scanCodingClisParallel(): Promise<DetectedCli[]> {
  return Promise.all(
    CLI_DEFS.map(async (def) => {
      let resolved = await resolveOnPath(def.bin);
      if (!resolved && def.extraResolve) resolved = await def.extraResolve();
      if (!resolved) {
        return { id: def.id, bin: def.bin, path: "", version: null, available: false };
      }
      const version = await getVersion(resolved);
      return { id: def.id, bin: def.bin, path: resolved, version, available: true };
    })
  );
}
8. 参考链接
Codex：https://developers.openai.com/codex/cli

Claude Code：https://code.claude.com/docs

Pi：https://pi.dev/docs

OMP：https://omp.sh



Collect CLI induction methods for auto-scan integration - Grok