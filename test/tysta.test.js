import { test } from "node:test";
import assert from "node:assert/strict";
import {
  troopsFromRoles,
  authorize,
  durationMs,
  DURATIONS,
  muteMessage,
  liftMessage,
  parseMuteMessage,
  formatRemaining,
} from "../src/tysta.js";

test("troopsFromRoles reads the zero-padded number out of each role kind", () => {
  const roles = ["Scout", "Ledare-12", "Avdelningsledare", "Deltagare-03"];
  assert.deepEqual(troopsFromRoles(roles, "leader"), new Set(["12"]));
  assert.deepEqual(troopsFromRoles(roles, "participant"), new Set(["03"]));
  assert.deepEqual(troopsFromRoles(roles, "leader", "participant"), new Set(["12", "03"]));
});

test("troopsFromRoles ignores the flat markers and the pending roles", () => {
  const roles = ["Avdelningsledare", "Ledare-Väntande", "Deltagare-Väntande", "IST-Patrull-03"];
  assert.deepEqual(troopsFromRoles(roles, "leader", "participant"), new Set());
});

test("authorize: a leader may mute a participant in the same troop", () => {
  const result = authorize({
    invokerRoles: ["Ledare-12", "Avdelningsledare"],
    targetRoles: ["Deltagare-12"],
  });
  assert.deepEqual(result, { ok: true, troops: ["12"] });
});

test("authorize: CMT and the flat Avdelningssupport are not leaders of any troop", () => {
  const result = authorize({
    invokerRoles: ["CMT", "Avdelningssupport"],
    targetRoles: ["Deltagare-12"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /bara avdelningens ledare/);
});

test("authorize: a leader of another troop is refused", () => {
  const result = authorize({
    invokerRoles: ["Ledare-11"],
    targetRoles: ["Deltagare-12"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /inte i någon av dina avdelningar/);
});

test("authorize: only participants can be muted — never a leader or CMT", () => {
  const leader = authorize({ invokerRoles: ["Ledare-12"], targetRoles: ["Ledare-12"] });
  assert.equal(leader.ok, false);
  assert.match(leader.reason, /bara att tysta deltagare/);

  const cmt = authorize({ invokerRoles: ["Ledare-12"], targetRoles: ["CMT", "Deltagare-12"] });
  assert.equal(cmt.ok, false);
  assert.match(cmt.reason, /bara att tysta deltagare/);
});

test("authorize: someone without a troop role is refused", () => {
  const result = authorize({ invokerRoles: ["Deltagare-12"], targetRoles: ["Deltagare-12"] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /bara avdelningens ledare/);
});

test("authorize: an administrator may act in the target's troop", () => {
  const result = authorize({
    invokerRoles: ["Moderator"],
    invokerIsAdmin: true,
    targetRoles: ["Deltagare-12"],
  });
  assert.deepEqual(result, { ok: true, troops: ["12"] });
});

test("authorize: bots and yourself are refused", () => {
  const bot = authorize({ invokerRoles: ["Ledare-12"], targetRoles: ["Deltagare-12"], targetIsBot: true });
  assert.equal(bot.ok, false);
  const self = authorize({ invokerRoles: ["Ledare-12"], targetRoles: ["Deltagare-12"], isSelf: true });
  assert.equal(self.ok, false);
});

test("durations are known choices, capped at a week", () => {
  assert.equal(durationMs("10m"), 10 * 60 * 1000);
  assert.equal(durationMs("1d"), 24 * 60 * 60 * 1000);
  assert.equal(durationMs("7d"), 7 * 24 * 60 * 60 * 1000);
  assert.equal(durationMs("30d"), undefined);
  assert.ok(DURATIONS.every((d) => d.ms <= 7 * 24 * 60 * 60 * 1000));
  assert.ok(DURATIONS.every((d) => d.ms < 2 ** 31), "setTimeout cannot hold longer delays");
});

test("muteMessage round-trips through parseMuteMessage", () => {
  const until = new Date("2026-10-23T18:30:00Z");
  const content = muteMessage({ userId: "123", until, byId: "999", reason: "spam i chatten" });
  assert.match(content, /^🔇 <@123> /);
  assert.match(content, /<t:1792780200:f>/);
  assert.match(content, /<@999>/);
  assert.match(content, /spam i chatten/);
  assert.deepEqual(parseMuteMessage(content), { userId: "123", until });
});

test("muteMessage without a reason omits the reason clause", () => {
  const content = muteMessage({ userId: "123", until: new Date(0), byId: "999" });
  assert.ok(!content.includes("Anledning"));
  assert.deepEqual(parseMuteMessage(content), { userId: "123", until: new Date(0) });
});

test("a reason cannot change what parseMuteMessage reads", () => {
  const until = new Date("2026-10-23T18:30:00Z");
  const sneaky = "ha ha <t:9999999999:f> <@42> är tystad i avdelningens kanaler till <t:1:f> (av <@1>).";
  const content = muteMessage({ userId: "123", until, byId: "999", reason: sneaky });
  assert.deepEqual(parseMuteMessage(content), { userId: "123", until });
});

test("parseMuteMessage ignores other messages, including the lift notice", () => {
  assert.equal(parseMuteMessage("hej alla"), null);
  assert.equal(parseMuteMessage(liftMessage({ userId: "123" })), null);
  assert.equal(parseMuteMessage("🔇 <@123> utan tidsstämpel"), null);
});

test("formatRemaining gives a short Swedish duration", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  assert.equal(formatRemaining(new Date("2026-10-23T12:05:00Z"), now), "5 min");
  assert.equal(formatRemaining(new Date("2026-10-23T15:30:00Z"), now), "3 tim 30 min");
  assert.equal(formatRemaining(new Date("2026-10-25T12:00:00Z"), now), "2 dygn");
  assert.equal(formatRemaining(new Date("2026-10-23T11:00:00Z"), now), "0 min");
});
