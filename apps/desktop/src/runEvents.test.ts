import { expect, test } from "bun:test";
import { RunEvents } from "./runEvents";

test("replays matching output and completion after the start response", () => {
  const events = new RunEvents();
  const seen: string[] = [];
  expect(events.begin()).toBe(true);
  events.dispatch("other", () => seen.push("unrelated"));
  events.dispatch("run", () => seen.push("output"));
  events.dispatch("run", () => {
    seen.push("completed");
    events.reset();
  });
  expect(seen).toEqual([]);

  events.activate("run");
  expect(seen).toEqual(["output", "completed"]);
  events.dispatch("run", () => seen.push("late"));
  expect(seen).toEqual(["output", "completed"]);
  expect(events.begin()).toBe(true);
});

test("blocks duplicate starts while starting or running and discards failed startup events", () => {
  const events = new RunEvents();
  expect(events.begin()).toBe(true);
  expect(events.begin()).toBe(false);
  events.dispatch("run", () => {
    throw new Error("failed startup event was replayed");
  });
  events.reset();

  expect(events.begin()).toBe(true);
  events.activate("run");
  expect(events.begin()).toBe(false);
});
