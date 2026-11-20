import { test } from "node:test";
import assert from "node:assert/strict";
import { createEventLog, who } from "../src/eventlog.js";

const NOW = () => 1_700_000_000_000;

test("lines are buffered and sent as one message, each with a timestamp", async () => {
  const sent = [];
  const { log, flush, stop } = createEventLog({ send: async (t) => sent.push(t), now: NOW });
  log("en");
  log("två");
  assert.equal(sent.length, 0, "log() never sends by itself");
  await flush();
  stop();
  assert.deepEqual(sent, ["<t:1700000000:T> en\n<t:1700000000:T> två"]);
});

test("long batches are split under Discord's 2000-character limit", async () => {
  const sent = [];
  const { log, flush, stop } = createEventLog({ send: async (t) => sent.push(t), now: NOW });
  for (let i = 0; i < 100; i += 1) log("x".repeat(50));
  await flush();
  stop();
  assert.ok(sent.length > 1);
  for (const body of sent) assert.ok(body.length <= 2000);
});

test("without a channel it is off and never throws", async () => {
  const { log, flush } = createEventLog({ send: null });
  log("ingenting");
  await flush();
});

test("a failed write is swallowed — a log line never fails the caller", async () => {
  const { log, flush, stop } = createEventLog({
    send: async () => {
      throw new Error("Missing Access");
    },
    now: NOW,
  });
  log("rad");
  const original = console.error;
  console.error = () => {};
  try {
    await flush();
  } finally {
    console.error = original;
    stop();
  }
});

test("who() names a member in bold, escaped, and falls back to the id", async () => {
  const guild = {
    members: {
      cache: new Map([["1", { displayName: "Anna_Karin*" }]]),
      fetch: async (id) => {
        if (id === "2") return { displayName: "Bo" };
        throw new Error("Unknown Member");
      },
    },
  };
  assert.equal(await who(guild, "1"), "**Anna\\_Karin\\***");
  assert.equal(await who(guild, "2"), "**Bo**");
  assert.equal(await who(guild, "3"), "`3`");
});
