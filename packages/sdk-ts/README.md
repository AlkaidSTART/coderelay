# @alkaidstart/coderelay-sdk

TypeScript client for the CodeRelay local agent control plane.

```ts
import { CoderelayClient } from "@alkaidstart/coderelay-sdk";

const client = new CoderelayClient({
  command: "coderelay",
  args: ["sdk"],
});

const discovery = await client.discoverAgents({ cwd: process.cwd() });
const catalog = await client.getModelCatalog({ cwd: process.cwd() });

const run = await client.run({
  workspace: { cwd: process.cwd() },
  request: { prompt: "Fix the failing tests" },
});

for await (const event of run) {
  if (event.kind === "assistant_text") {
    process.stdout.write(event.text);
  }
}

const result = await run.completed;
await client.close();
```

The SDK talks to a long-lived `coderelay sdk` process over versioned NDJSON.
It never receives arbitrary argv or shell access: only validated domain requests
are accepted by the host.
