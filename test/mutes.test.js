import { test } from "node:test";
import assert from "node:assert/strict";
import { ChannelType, OverwriteType, PermissionFlagsBits } from "discord.js";
import { ForeignOverwriteError, MuteRegistry, troopChannels, leaderTroops, MUTE_DENY_BITS } from "../src/mutes.js";
import { muteMessage } from "../src/tysta.js";

const BOT_ID = "bot";

// Shaped like discord.js PermissionOverwrites: allow/deny are bitfields.
function muteOverwrite(id) {
  return {
    id,
    type: OverwriteType.Member,
    allow: { bitfield: 0n },
    deny: { bitfield: MUTE_DENY_BITS },
  };
}

function fakeChannel({ id, type, roleIds, memberIds = [], foreign = [] }) {
  const cache = new Map();
  for (const roleId of roleIds) {
    cache.set(roleId, {
      id: roleId,
      type: OverwriteType.Role,
      allow: { bitfield: PermissionFlagsBits.ViewChannel, has: (bit) => bit === PermissionFlagsBits.ViewChannel },
      deny: { bitfield: 0n },
    });
  }
  for (const memberId of memberIds) cache.set(memberId, muteOverwrite(memberId));
  // human-written member overwrites: one allows a bit, one denies only Send Messages
  for (const [i, memberId] of foreign.entries()) {
    cache.set(
      memberId,
      i % 2 === 0
        ? { ...muteOverwrite(memberId), allow: { bitfield: 2048n } }
        : { ...muteOverwrite(memberId), deny: { bitfield: PermissionFlagsBits.SendMessages } }
    );
  }
  const channel = {
    id,
    type,
    sent: [],
    history: [],
    permissionOverwrites: {
      cache,
      edits: [],
      deletes: [],
      async edit(target, options, overwriteOptions) {
        this.edits.push({ target, options, overwriteOptions });
        cache.set(target, muteOverwrite(target));
      },
      async delete(target) {
        this.deletes.push(target);
        cache.delete(target);
      },
    },
    permissionsFor: () => ({ has: () => true }),
    messages: {
      fetch: async () => new Map(channel.history.map((m, i) => [String(i), m])),
    },
    async send(payload) {
      channel.sent.push(payload.content);
    },
  };
  return channel;
}

function fakeGuild({ troops, memberIds = {}, foreign = {} }) {
  const roles = new Map();
  const channels = new Map();
  for (const troop of troops) {
    const participant = `role-deltagare-${troop}`;
    roles.set(participant, { id: participant, name: `Deltagare-${troop}` });
    roles.set(`role-ledare-${troop}`, { id: `role-ledare-${troop}`, name: `Ledare-${troop}` });
    const chat = fakeChannel({
      id: `chat-${troop}`,
      type: ChannelType.GuildText,
      roleIds: [participant, `role-ledare-${troop}`],
      memberIds: memberIds[troop] ?? [],
      foreign: foreign[troop] ?? [],
    });
    const forum = fakeChannel({
      id: `forum-${troop}`,
      type: ChannelType.GuildForum,
      roleIds: [participant],
      memberIds: memberIds[troop] ?? [],
    });
    const internal = fakeChannel({
      id: `internt-${troop}`,
      type: ChannelType.GuildText,
      roleIds: [`role-ledare-${troop}`],
    });
    for (const c of [chat, forum, internal]) channels.set(c.id, c);
  }
  return {
    id: "guild",
    roles: { cache: roles },
    channels: { cache: channels },
  };
}

const fakeClient = { user: { id: BOT_ID } };

test("troopChannels finds the chat and forum through the participant role, not the leader channel", () => {
  const guild = fakeGuild({ troops: ["12", "13"] });
  const troops = troopChannels(guild);
  assert.deepEqual([...troops.keys()].sort(), ["12", "13"]);
  const t12 = troops.get("12");
  assert.equal(t12.chat.id, "chat-12");
  assert.equal(t12.forum.id, "forum-12");
  assert.deepEqual(t12.channels.map((c) => c.id).sort(), ["chat-12", "forum-12"]);
});

test("troopChannels skips a channel shared by several troops, and one that only denies the role", () => {
  const guild = fakeGuild({ troops: ["12", "13"] });
  const shared = fakeChannel({ id: "shared", type: ChannelType.GuildText, roleIds: ["role-deltagare-12", "role-deltagare-13"] });
  const denied = fakeChannel({ id: "denied", type: ChannelType.GuildText, roleIds: ["role-deltagare-12"] });
  denied.permissionOverwrites.cache.get("role-deltagare-12").allow = { bitfield: 0n, has: () => false };
  guild.channels.cache.set("shared", shared);
  guild.channels.cache.set("denied", denied);

  const troops = troopChannels(guild);
  const ids = (t) => troops.get(t).channels.map((c) => c.id).sort();
  assert.deepEqual(ids("12"), ["chat-12", "forum-12"]);
  assert.deepEqual(ids("13"), ["chat-13", "forum-13"]);
});

test("mute writes a member deny in every troop channel and posts the notice in the chat", async () => {
  const guild = fakeGuild({ troops: ["12"] });
  const registry = new MuteRegistry(fakeClient);
  const until = new Date(Date.now() + 60_000);

  await registry.mute(guild, { troop: "12", userId: "kid", until, byId: "leader", reason: "spam" });

  const chat = guild.channels.cache.get("chat-12");
  const forum = guild.channels.cache.get("forum-12");
  for (const channel of [chat, forum]) {
    assert.equal(channel.permissionOverwrites.edits.length, 1);
    const { target, options, overwriteOptions } = channel.permissionOverwrites.edits[0];
    assert.equal(target, "kid");
    assert.equal(overwriteOptions.type, OverwriteType.Member);
    assert.deepEqual(options, {
      SendMessages: false,
      SendMessagesInThreads: false,
      AddReactions: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
    });
  }
  assert.equal(guild.channels.cache.get("internt-12").permissionOverwrites.edits.length, 0);
  assert.equal(chat.sent.length, 1);
  assert.match(chat.sent[0], /^🔇 <@kid> .*spam/);
  assert.equal(registry.list(["12"]).length, 1);
  registry.forget("12", "kid");
});

test("lift deletes the overwrites, announces, and reports false when nothing was there", async () => {
  const guild = fakeGuild({ troops: ["12"], memberIds: { 12: ["kid"] } });
  const registry = new MuteRegistry(fakeClient);

  assert.equal(await registry.lift(guild, { troop: "12", userId: "kid" }), true);
  assert.deepEqual(guild.channels.cache.get("chat-12").permissionOverwrites.deletes, ["kid"]);
  assert.deepEqual(guild.channels.cache.get("forum-12").permissionOverwrites.deletes, ["kid"]);
  assert.match(guild.channels.cache.get("chat-12").sent[0], /^🔈 <@kid>/);

  assert.equal(await registry.lift(guild, { troop: "12", userId: "kid" }), false);
});

test("reconcile keeps a mute whose notice is still in the future and lifts the rest", async () => {
  const guild = fakeGuild({ troops: ["12"], memberIds: { 12: ["1001", "1002", "1003", BOT_ID] } });
  const chat = guild.channels.cache.get("chat-12");
  const future = new Date(Date.now() + 3_600_000);
  const past = new Date(Date.now() - 3_600_000);
  // newest first, as messages.fetch returns them
  chat.history = [
    { author: { id: BOT_ID }, content: muteMessage({ userId: "1001", until: future, byId: "77" }) },
    { author: { id: BOT_ID }, content: muteMessage({ userId: "1001", until: past, byId: "77" }) },
    { author: { id: BOT_ID }, content: muteMessage({ userId: "1002", until: past, byId: "77" }) },
    { author: { id: "someone" }, content: muteMessage({ userId: "1003", until: future, byId: "77" }) },
  ];

  const registry = new MuteRegistry(fakeClient);
  await registry.reconcile(guild);

  assert.deepEqual(registry.list(["12"]).map((m) => m.userId), ["1001"]);
  assert.deepEqual(chat.permissionOverwrites.deletes.sort(), ["1002", "1003"]);
  assert.ok(chat.permissionOverwrites.cache.has("1001"));
  assert.ok(chat.permissionOverwrites.cache.has(BOT_ID), "the bot's own overwrite is never touched");
  registry.forget("12", "1001");
});

test("reconcile lifts everything when the chat history cannot be read", async () => {
  const guild = fakeGuild({ troops: ["12"], memberIds: { 12: ["1001"] } });
  const chat = guild.channels.cache.get("chat-12");
  chat.messages.fetch = async () => {
    throw Object.assign(new Error("Missing Access"), { code: 50001 });
  };
  const registry = new MuteRegistry(fakeClient);
  await registry.reconcile(guild);
  assert.deepEqual(chat.permissionOverwrites.deletes, ["1001"]);
  assert.equal(registry.list(["12"]).length, 0);
});

test("a member overwrite of any other shape is not a mute: reconcile and lift leave it alone", async () => {
  const guild = fakeGuild({ troops: ["12"], memberIds: { 12: ["1001"] }, foreign: { 12: ["2002", "2003"] } });
  const chat = guild.channels.cache.get("chat-12");
  const registry = new MuteRegistry(fakeClient);

  await registry.reconcile(guild);
  assert.deepEqual(chat.permissionOverwrites.deletes, ["1001"], "only the exact mute shape is lifted");
  assert.ok(chat.permissionOverwrites.cache.has("2002"), "allows a bit → not ours");
  assert.ok(chat.permissionOverwrites.cache.has("2003"), "denies a different set → not ours");

  assert.equal(await registry.lift(guild, { troop: "12", userId: "2002" }), false);
  assert.equal(await registry.lift(guild, { troop: "12", userId: "2003" }), false);
  assert.ok(chat.permissionOverwrites.cache.has("2002"));
  assert.ok(chat.permissionOverwrites.cache.has("2003"));
});

test("mute refuses, before touching anything, when a human-written overwrite is already there", async () => {
  const guild = fakeGuild({ troops: ["12"], foreign: { 12: ["2002"] } });
  const chat = guild.channels.cache.get("chat-12");
  const forum = guild.channels.cache.get("forum-12");
  // the fixture seeds the foreign overwrite in the chat only; the forum is clean
  assert.ok(!forum.permissionOverwrites.cache.has("2002"));
  const registry = new MuteRegistry(fakeClient);

  await assert.rejects(
    registry.mute(guild, { troop: "12", userId: "2002", until: new Date(Date.now() + 60_000), byId: "77" }),
    ForeignOverwriteError
  );
  assert.equal(forum.permissionOverwrites.edits.length, 0, "nothing written in the clean channel either");
  assert.equal(chat.permissionOverwrites.edits.length, 0);
  assert.equal(chat.sent.length, 0);
  assert.equal(registry.list(["12"]).length, 0);
});

test("mute over an existing mute just rewrites it", async () => {
  const guild = fakeGuild({ troops: ["12"], memberIds: { 12: ["1001"] } });
  const registry = new MuteRegistry(fakeClient);
  await registry.mute(guild, { troop: "12", userId: "1001", until: new Date(Date.now() + 60_000), byId: "77" });
  assert.equal(guild.channels.cache.get("chat-12").permissionOverwrites.edits.length, 1);
  registry.forget("12", "1001");
});

test("reconcile caps a notice's expiry at the longest mute after the notice was posted", async () => {
  const guild = fakeGuild({ troops: ["12"], memberIds: { 12: ["1001"] } });
  const chat = guild.channels.cache.get("chat-12");
  const posted = Date.now() - 60_000;
  const absurd = new Date(Date.now() + 365 * 24 * 3_600_000);
  chat.history = [
    { author: { id: BOT_ID }, createdTimestamp: posted, content: muteMessage({ userId: "1001", until: absurd, byId: "77" }) },
  ];
  const registry = new MuteRegistry(fakeClient);
  await registry.reconcile(guild);
  const [mute] = registry.list(["12"]);
  assert.equal(mute.until.getTime(), posted + 7 * 24 * 3_600_000);
  registry.forget("12", "1001");
});

test("leaderTroops: roles for leaders, every troop for an administrator", () => {
  const guild = fakeGuild({ troops: ["12", "13"] });
  const member = (names, admin) => ({
    roles: { cache: names.map((name) => ({ name })) },
    permissions: { has: () => admin },
  });
  assert.deepEqual(leaderTroops(member(["Ledare-13", "Ledare-12"], false), guild), ["12", "13"]);
  assert.deepEqual(leaderTroops(member(["Deltagare-12"], false), guild), []);
  assert.deepEqual(leaderTroops(member(["Moderator"], true), guild), ["12", "13"]);
});
