// Pure logic behind /tysta, /häv-tystnad and /tystade. Nothing in here touches
// Discord, so it can be tested with `npm test` and read without the client.
//
// The guild's troop structure is read off role names, which wsj27-infra owns
// (discord/roles.tf): `Deltagare-NN` and `Ledare-NN`. A rename there breaks
// this silently — the same dependency the ScoutID bot has. (The per-troop
// `Avdelningssupport-Avd-NN` roles were removed 2026-10-13; the flat
// `Avdelningssupport` that remains is CMT and gets no troop of its own here.)

const ROLE_PATTERNS = {
  participant: /^Deltagare-(\d{2})$/,
  leader: /^Ledare-(\d{2})$/,
};

/** Troop numbers ("12") a member holds through roles of the given kinds. */
export function troopsFromRoles(roleNames, ...kinds) {
  const troops = new Set();
  for (const kind of kinds) {
    const pattern = ROLE_PATTERNS[kind];
    for (const name of roleNames) {
      const match = pattern.exec(name);
      if (match) troops.add(match[1]);
    }
  }
  return troops;
}

/**
 * Decide whether the invoker may mute/unmute the target, and in which troops.
 *
 * The rule is narrow on purpose: only a participant can be muted, and only by
 * a leader of a troop the participant belongs to. An
 * administrator (Moderator, Discord Admin) can act in any troop, but still only
 * against participants — leaders and CMT are moderated by people, not by this.
 */
export function authorize({
  invokerRoles,
  targetRoles,
  invokerIsAdmin = false,
  targetIsBot = false,
  isSelf = false,
}) {
  if (targetIsBot) return { ok: false, reason: "Bottar kan inte tystas." };
  if (isSelf) return { ok: false, reason: "Du kan inte tysta dig själv." };

  const targetTroops = troopsFromRoles(targetRoles, "participant");
  const targetIsStaff =
    troopsFromRoles(targetRoles, "leader").size > 0 ||
    targetRoles.some((r) => ["CMT", "Moderator", "Discord Admin", "IST-Support", "Avdelningssupport"].includes(r));
  if (targetTroops.size === 0 || targetIsStaff) {
    return { ok: false, reason: "Det går bara att tysta deltagare (Deltagare-XX)." };
  }

  const invokerTroops = troopsFromRoles(invokerRoles, "leader");
  if (invokerIsAdmin) {
    return { ok: true, troops: [...targetTroops].sort() };
  }
  if (invokerTroops.size === 0) {
    return { ok: false, reason: "Kommandot kan bara avdelningens ledare använda." };
  }

  const troops = [...targetTroops].filter((t) => invokerTroops.has(t)).sort();
  if (troops.length === 0) {
    return { ok: false, reason: "Den deltagaren är inte i någon av dina avdelningar." };
  }
  return { ok: true, troops };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Choices for the `tid` option. A week is the ceiling; longer is a Moderator matter. */
export const DURATIONS = [
  { value: "10m", label: "10 minuter", ms: 10 * MINUTE },
  { value: "30m", label: "30 minuter", ms: 30 * MINUTE },
  { value: "1h", label: "1 timme", ms: HOUR },
  { value: "3h", label: "3 timmar", ms: 3 * HOUR },
  { value: "12h", label: "12 timmar", ms: 12 * HOUR },
  { value: "1d", label: "1 dygn", ms: DAY },
  { value: "3d", label: "3 dygn", ms: 3 * DAY },
  { value: "7d", label: "1 vecka", ms: 7 * DAY },
];

export function durationMs(value) {
  return DURATIONS.find((d) => d.value === value)?.ms;
}

// The bot keeps no state of its own (see README: "Storage — none"). The mute
// itself lives in Discord as a member overwrite; its *expiry* lives in the
// notice the bot posts in the troop chat, formatted so the bot can read it back
// after a restart. `<t:EPOCH:f>` is Discord's own timestamp markup, so the
// humans see a local date and the bot sees a number. Keep the shape stable:
// parseMuteMessage is what reconciles live overwrites after a restart.

export const MUTE_MARK = "🔇";
export const LIFT_MARK = "🔈";

export function muteMessage({ userId, until, byId, reason }) {
  const epoch = Math.floor(until.getTime() / 1000);
  let text = `${MUTE_MARK} <@${userId}> är tystad i avdelningens kanaler till <t:${epoch}:f> (av <@${byId}>).`;
  if (reason) text += ` Anledning: ${reason}`;
  return text;
}

export function liftMessage({ userId }) {
  return `${LIFT_MARK} <@${userId}> kan skriva igen.`;
}

// Anchored to the fixed prefix, with the reason *after* the timestamp: nothing
// a leader types into `anledning` can reach the captured groups.
const MUTE_PATTERN = /^🔇 <@(\d+)> är tystad i avdelningens kanaler till <t:(\d+):f> \(av <@\d+>\)\./u;

/** Longest mute the commands offer; reconcile() trusts no notice beyond it. */
export const MAX_MUTE_MS = Math.max(...DURATIONS.map((d) => d.ms));

/** `{ userId, until }` for a notice written by muteMessage, otherwise null. */
export function parseMuteMessage(content) {
  const match = MUTE_PATTERN.exec(content ?? "");
  if (!match) return null;
  return { userId: match[1], until: new Date(Number(match[2]) * 1000) };
}

/** "3 tim 30 min" / "2 dygn" / "5 min", never negative. */
export function formatRemaining(until, now = new Date()) {
  const minutes = Math.max(0, Math.round((until.getTime() - now.getTime()) / MINUTE));
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  const parts = [];
  if (days) parts.push(`${days} dygn`);
  if (hours) parts.push(`${hours} tim`);
  if (mins || parts.length === 0) parts.push(`${mins} min`);
  return parts.join(" ");
}

/** Permission bits a muted participant loses in the troop's channels. */
export const MUTE_DENY = [
  "SendMessages",
  "SendMessagesInThreads",
  "AddReactions",
  "CreatePublicThreads",
  "CreatePrivateThreads",
];
