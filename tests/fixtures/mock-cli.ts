// 模拟 CLI：覆盖分块输出、工具状态、跨 chunk JSON、非法 JSON 回退、
// 非零退出、长睡（超时/取消）、子进程树（进程组取消）。
// 由 tests/agent-run.test.ts 经 `bun <this-file> <mode>` 启动。
import { spawn } from "node:child_process";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chunked(): Promise<void> {
  process.stdout.write("hel");
  await sleep(30);
  process.stdout.write("lo\n");
  await sleep(30);
  process.stdout.write("world\n");
}

async function stderrFlood(): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    process.stderr.write(`noise-${i}\n`);
    if (i === 100) {
      process.stdout.write("done\n");
    }
  }
}

async function splitJson(): Promise<void> {
  // 一行 JSON 故意拆成两个 chunk，验证流式拼接解析。
  process.stdout.write('{"type":"tool_st');
  await sleep(50);
  process.stdout.write('arted","tool":"splitter"}\n');
}

async function invalidJson(): Promise<void> {
  process.stdout.write("{not json\n");
}

async function fail(): Promise<void> {
  process.stderr.write("boom\n");
  process.exitCode = 2;
}

async function sleepLong(): Promise<void> {
  await sleep(30000);
}

async function child(): Promise<void> {
  // 孙进程与父进程同属一个进程组，abort 时应被一并终止。
  const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
    stdio: "ignore",
  });
  if (grandchild.pid === undefined) {
    process.stderr.write("failed to spawn grandchild\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`grandchild:${grandchild.pid}\n`);
  grandchild.unref();
  await sleep(30000);
}

const mode: string = process.argv[2] ?? "chunked";

switch (mode) {
  case "chunked":
    await chunked();
    break;
  case "stderr-flood":
    await stderrFlood();
    break;
  case "split-json":
    await splitJson();
    break;
  case "invalid-json":
    await invalidJson();
    break;
  case "fail":
    await fail();
    break;
  case "sleep":
    await sleepLong();
    break;
  case "child":
    await child();
    break;
  default:
    process.stderr.write(`unknown mode: ${mode}\n`);
    process.exitCode = 2;
}
