import { test } from "node:test";
import assert from "node:assert/strict";
import { ChannelType } from "discord.js";
import { MAX_AUTO_ARCHIVE, reopen, shouldReopen, sweep } from "../src/threads.js";

const CHATS = new Set(["chat-01"]);

function thread(overrides = {}) {
  return {
    id: "t1",
    type: ChannelType.PrivateThread,
    archived: true,
    locked: false,
    parentId: "chat-01",
    ...overrides,
  };
}

test("an archived private thread in a troop chat is reopened", () => {
  assert.equal(shouldReopen(thread(), CHATS), true);
});

test("a locked thread is left closed — that is how a leader closes one", () => {
  assert.equal(shouldReopen(thread({ locked: true }), CHATS), false);
});

test("a thread that is not archived needs nothing (also the bot's own edit echoing back)", () => {
  assert.equal(shouldReopen(thread({ archived: false }), CHATS), false);
});

test("public threads are left to fade", () => {
  assert.equal(shouldReopen(thread({ type: ChannelType.PublicThread }), CHATS), false);
});

test("private threads outside the troop chats are not ours", () => {
  assert.equal(shouldReopen(thread({ parentId: "ledare-01" }), CHATS), false);
});

test("reopen unarchives and stretches the window to a week in one edit", async () => {
  const edits = [];
  await reopen({ edit: async (data) => edits.push(data) });
  assert.equal(edits.length, 1);
  assert.equal(edits[0].archived, false);
  assert.equal(edits[0].autoArchiveDuration, MAX_AUTO_ARCHIVE);
});

// --- sweep -----------------------------------------------------------------

// troopChannels() needs a guild whose chat lets in exactly one Deltagare-NN role.
function fakeGuild(pages) {
  const role = { id: "r01", name: "Deltagare-01" };
  const calls = [];
  const chat = {
    id: "chat-01",
    name: "01-djur-chat",
    type: ChannelType.GuildText,
    permissionOverwrites: {
      cache: new Map([["r01", { allow: { has: () => true } }]]),
    },
    threads: {
      fetchArchived: async (opts) => {
        calls.push(opts);
        return pages[calls.length - 1];
      },
    },
  };
  const guild = {
    id: "g",
    roles: { cache: new Map([["r01", role]]) },
    channels: { cache: new Map([["chat-01", chat]]) },
  };
  return { guild, calls };
}

// discord.js returns a Collection; a Map with .map is enough here.
function collection(items) {
  const m = new Map(items.map((t) => [t.id, t]));
  m.map = (fn) => [...m.values()].map(fn);
  return m;
}

function archived(id, at, extra = {}) {
  const edits = [];
  return { ...thread({ id, ...extra }), archivedAt: new Date(at), edits, edit: async (d) => edits.push(d) };
}

test("sweep pages through all archived private threads and skips locked ones", async () => {
  const a = archived("a", 3000);
  const b = archived("b", 2000, { locked: true });
  const c = archived("c", 1000);
  const { guild, calls } = fakeGuild([
    { threads: collection([a, b]), hasMore: true },
    { threads: collection([c]), hasMore: false },
  ]);

  assert.equal(await sweep(guild), 2);
  assert.equal(a.edits.length, 1);
  assert.equal(b.edits.length, 0);
  assert.equal(c.edits.length, 1);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, "private");
  assert.equal(calls[0].fetchAll, true);
  assert.equal(calls[0].before, undefined);
  assert.equal(calls[1].before, 2000, "second page continues from the oldest thread seen");
});

test("sweep stops rather than loop if a page does not move the cursor", async () => {
  const a = archived("a", 1000);
  const { guild, calls } = fakeGuild([
    { threads: collection([a]), hasMore: true },
    { threads: collection([a]), hasMore: true },
    { threads: collection([a]), hasMore: true },
  ]);
  await sweep(guild);
  assert.equal(calls.length, 2);
});
