import React, { useState } from "react";
import { Box, Text, render, useInput } from "ink";
import { spawn } from "node:child_process";
import { once } from "node:events";

function Screen({ onLaunch, note }: { onLaunch: () => void; note: string }) {
  useInput((input) => { if (input === "g") onLaunch(); });
  return <Box flexDirection="column"><Text color="green">UI note: {note}</Text><Text>press g to launch child</Text></Box>;
}

async function main() {
  let instance: ReturnType<typeof render> | undefined;
  const boot = (note: string) => {
    instance = render(<Screen note={note} onLaunch={() => { void run("note " + note); }} />);
  };
  const run = async (note: string) => {
    instance?.unmount();
    const child = spawn(process.execPath, ["-e", "setTimeout(()=>{},50); console.log('child said hi from', process.pid)"], { stdio: "inherit" });
    const [code, signal] = await once(child, "exit") as [number | null, NodeJS.Signals | null];
    boot(`child exited code=${code} signal=${signal} (was: ${note})`);
  };
  boot("initial");
}
void main();
