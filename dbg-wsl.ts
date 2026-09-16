import { scanWslClis } from "./src/scanner/wsl";

const calls: string[] = [];
const list = `U${String.fromCharCode(0)}b${String.fromCharCode(0)}u${String.fromCharCode(0)}n${String.fromCharCode(0)}t${String.fromCharCode(0)}u${String.fromCharCode(0)}\r${String.fromCharCode(0)}\n${String.fromCharCode(0)}`;

const outputs: Record<string, string> = {
  "wsl.exe -l -q": list,
  "wsl.exe -d Ubuntu -- sh -lc command -v codex": "/home/me/.local/bin/codex\n",
  "wsl.exe -d Ubuntu -- /home/me/.local/bin/codex --version":
    "codex-cli 0.139.0\n",
};

const result = await scanWslClis({
  execFile: async (file, args) => {
    const command = [file, ...args].join(" ");
    calls.push(command);
    const stdout = outputs[command];
    if (stdout === undefined) {
      throw Object.assign(new Error(`no: ${command}`), { code: "ENOENT" });
    }
    return { stdout, stderr: "" };
  },
  versionArgs: [["--version"]],
});

console.log("distros:", JSON.stringify(result.distros));
console.log("locations:", JSON.stringify(result.locations.get("codex")));
console.log("calls:", JSON.stringify(calls, null, 1));
