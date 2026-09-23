import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";

import type { DetectedCli } from "../src/models/cli";
import { App } from "../src/ui/App";
import { matchSlashCommands } from "../src/ui/slash-commands";

const CLIS: DetectedCli[] = [
  {
    id: "codex",
    bin: "codex",
    path: "/opt/bin/codex",
    version: "codex-cli 0.1.0",
    available: true,
  },
];

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe("Slash commands matching for workspace", () => {
  test("matches /workspace and /cd commands", () => {
    expect(matchSlashCommands("/workspace").map((c) => c.name)).toEqual(["/workspace"]);
    expect(matchSlashCommands("/cd").map((c) => c.name)).toEqual(["/cd"]);
    expect(matchSlashCommands("/work").map((c) => c.name)).toEqual(["/workspace"]);
  });
});

describe("Workspace command in App", () => {
  test("shows current workspace when /workspace has no arguments", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "coderelay-ws-view-"));
    try {
      const instance = render(
        <App
          clis={CLIS}
          initialId="codex"
          workspace={tempDir}
          onLaunch={() => {}}
          onExit={() => {}}
        />,
      );

      // Enter picker, then enter chat
      instance.stdin.write("\r");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      instance.stdin.write("/workspace");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      const frame = instance.lastFrame() ?? "";
      expect(frame).toContain(`当前工作区：${tempDir}`);
      instance.cleanup();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("switches workspace successfully and calls onWorkspaceChange", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "coderelay-ws-base-"));
    const targetDir = join(baseDir, "subproject");
    mkdirSync(targetDir, { recursive: true });

    try {
      let changedWorkspace: string | undefined;
      const instance = render(
        <App
          clis={CLIS}
          initialId="codex"
          workspace={baseDir}
          onWorkspaceChange={(dir) => {
            changedWorkspace = dir;
          }}
          onLaunch={() => {}}
          onExit={() => {}}
        />,
      );

      // Enter chat
      instance.stdin.write("\r");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      instance.stdin.write(`/workspace ${targetDir}`);
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      expect(changedWorkspace).toBe(targetDir);
      const frame = instance.lastFrame() ?? "";
      expect(frame).toContain("工作区已切换为");
      expect(frame).toContain(targetDir);
      instance.cleanup();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  test("works with /cd alias", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "coderelay-cd-base-"));
    const targetDir = join(baseDir, "target");
    mkdirSync(targetDir, { recursive: true });

    try {
      let changedWorkspace: string | undefined;
      const instance = render(
        <App
          clis={CLIS}
          initialId="codex"
          workspace={baseDir}
          onWorkspaceChange={(dir) => {
            changedWorkspace = dir;
          }}
          onLaunch={() => {}}
          onExit={() => {}}
        />,
      );

      // Enter chat
      instance.stdin.write("\r");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      instance.stdin.write(`/cd ${targetDir}`);
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      expect(changedWorkspace).toBe(targetDir);
      const frame = instance.lastFrame() ?? "";
      expect(frame).toContain("工作区已切换为");
      expect(frame).toContain(targetDir);
      instance.cleanup();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  test("shows error when directory does not exist", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "coderelay-ws-nonexist-"));
    const nonExistent = join(baseDir, "does-not-exist");

    try {
      let changedWorkspace: string | undefined;
      const instance = render(
        <App
          clis={CLIS}
          initialId="codex"
          workspace={baseDir}
          onWorkspaceChange={(dir) => {
            changedWorkspace = dir;
          }}
          onLaunch={() => {}}
          onExit={() => {}}
        />,
      );

      // Enter chat
      instance.stdin.write("\r");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      instance.stdin.write(`/workspace ${nonExistent}`);
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      expect(changedWorkspace).toBeUndefined();
      const frame = instance.lastFrame() ?? "";
      expect(frame).toContain("目录不存在");
      instance.cleanup();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  test("shows error when target path is a file instead of directory", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "coderelay-ws-file-"));
    const filePath = join(baseDir, "some-file.txt");
    writeFileSync(filePath, "hello");

    try {
      let changedWorkspace: string | undefined;
      const instance = render(
        <App
          clis={CLIS}
          initialId="codex"
          workspace={baseDir}
          onWorkspaceChange={(dir) => {
            changedWorkspace = dir;
          }}
          onLaunch={() => {}}
          onExit={() => {}}
        />,
      );

      // Enter chat
      instance.stdin.write("\r");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      instance.stdin.write(`/workspace ${filePath}`);
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      expect(changedWorkspace).toBeUndefined();
      const frame = instance.lastFrame() ?? "";
      expect(frame).toContain("路径不是目录");
      instance.cleanup();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  test("shows recent workspaces list when /workspace has no arguments and recentWorkspaces provided", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "coderelay-ws-recents-"));
    const ws1 = join(baseDir, "project-alpha");
    const ws2 = join(baseDir, "project-beta");
    mkdirSync(ws1, { recursive: true });
    mkdirSync(ws2, { recursive: true });

    try {
      const instance = render(
        <App
          clis={CLIS}
          initialId="codex"
          workspace={baseDir}
          recentWorkspaces={[ws1, ws2]}
          onLaunch={() => {}}
          onExit={() => {}}
        />,
      );

      // Enter chat
      instance.stdin.write("\r");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      instance.stdin.write("/workspace");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      const frame = instance.lastFrame() ?? "";
      expect(frame).toContain(`当前工作区：${baseDir}`);
      expect(frame).toContain("最近工作区：");
      expect(frame).toContain(`[1] ${ws1}`);
      expect(frame).toContain(`[2] ${ws2}`);
      instance.cleanup();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  test("switches workspace by numeric index referencing recent workspaces", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "coderelay-ws-idx-"));
    const ws1 = join(baseDir, "project-alpha");
    const ws2 = join(baseDir, "project-beta");
    mkdirSync(ws1, { recursive: true });
    mkdirSync(ws2, { recursive: true });

    try {
      let changedWorkspace: string | undefined;
      const instance = render(
        <App
          clis={CLIS}
          initialId="codex"
          workspace={baseDir}
          recentWorkspaces={[ws1, ws2]}
          onWorkspaceChange={(dir) => {
            changedWorkspace = dir;
          }}
          onLaunch={() => {}}
          onExit={() => {}}
        />,
      );

      // Enter chat
      instance.stdin.write("\r");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      // Switch using index 2 (project-beta)
      instance.stdin.write("/workspace 2");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      expect(changedWorkspace).toBe(ws2);
      const frame = instance.lastFrame() ?? "";
      expect(frame).toContain("工作区已切换为");
      expect(frame).toContain(ws2);
      instance.cleanup();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  test("shows suggestions when typing /workspace with recent workspaces", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "coderelay-ws-sug-"));
    const ws1 = join(baseDir, "alpha-repo");
    mkdirSync(ws1, { recursive: true });

    try {
      const instance = render(
        <App
          clis={CLIS}
          initialId="codex"
          workspace={baseDir}
          recentWorkspaces={[ws1]}
          onLaunch={() => {}}
          onExit={() => {}}
        />,
      );

      // Enter chat
      instance.stdin.write("\r");
      await nextTick();
      instance.stdin.write("\r");
      await nextTick();

      // Type /workspace with space to trigger recent workspace suggestions
      instance.stdin.write("/workspace ");
      await nextTick();

      const frame = instance.lastFrame() ?? "";
      expect(frame).toContain("/workspace 1");
      expect(frame).toContain(ws1);
      instance.cleanup();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
