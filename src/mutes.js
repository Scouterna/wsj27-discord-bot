// Per-troop mutes: a participant loses the right to write in their troop's
// channels for a while, without a server-wide Discord timeout.
//
// Discord's own timeout ("Timeout Members") is guild-wide and cannot be scoped
// to a channel, so a leader with it could silence any participant everywhere.
// This instead writes a *member overwrite* in the troop's channels that denies
// the write bits (see MUTE_DENY in tysta.js) and removes it when the time is
// up. The participant keeps reading; they just cannot post, react or open
// threads in those channels.
//
// Which channels are "the troop's" is read off the server itself: every channel
// carrying an overwrite for the `Deltagare-NN` role belongs to troop NN. Today
// that is #NN-djur-chat and #NN-djur-ledarinfo (wsj27-infra permissions.tf),
// and a channel added there later is picked up without a change here.
//
// State: the overwrite is the mute, Discord holds it. The expiry is in the
// notice posted in the troop chat (muteMessage), which reconcile() reads back
// after a restart so a mute neither outlives its time nor gets lost. If the
// notice is gone — deleted by a leader, or older than the last 100 messages —
// the mute is lifted: failing open is the right failure for 14-year-olds.

import { ChannelType, OverwriteType, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import {
  MAX_MUTE_MS,
  MUTE_DENY,
  liftMessage,
  muteMessage,
  parseMuteMessage,
  troopsFromRoles,
} from "./tysta.js";

const DENY = Object.fromEntries(MUTE_DENY.map((bit) => [bit, false]));
export const MUTE_DENY_BITS = PermissionsBitField.resolve(MUTE_DENY);
const PARTICIPANT_ROLE = /^Deltagare-(\d{2})$/;

/**
 * Is this overwrite one of ours? A mute is a *member* overwrite that allows
 * nothing and denies exactly MUTE_DENY. Anything else shaped — a member
 * overwrite that allows a bit, or denies more or less than that — was written
 * by a human for some other reason, and the bot leaves it alone (and says so).
 */
export function isMute(overwrite, botId) {
  return (
    overwrite.type === OverwriteType.Member &&
    overwrite.id !== botId &&
    overwrite.allow.bitfield === 0n &&
    overwrite.deny.bitfield === MUTE_DENY_BITS
  );
}

/** Map troop number → { chat, forum, channels[] } read off the guild's overwrites. */
export function troopChannels(guild) {
  const roleToTroop = new Map();
  for (const role of guild.roles.cache.values()) {
    const match = PARTICIPANT_ROLE.exec(role.name);
    if (match) roleToTroop.set(role.id, match[1]);
  }

  const troops = new Map();
  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildForum) continue;
    // A channel is a troop's own only if exactly one Deltagare-NN role is let
    // in. A channel shared by several troops (none exists today) is not any
    // one troop's to mute in, so it is skipped rather than claimed by all.
    const owners = new Set();
    for (const [roleId, troop] of roleToTroop) {
      const overwrite = channel.permissionOverwrites.cache.get(roleId);
      if (overwrite?.allow.has(PermissionFlagsBits.ViewChannel)) owners.add(troop);
    }
    if (owners.size !== 1) continue;
    const [troop] = owners;
    const entry = troops.get(troop) ?? { troop, chat: null, forum: null, channels: [] };
    entry.channels.push(channel);
    if (channel.type === ChannelType.GuildText && !entry.chat) entry.chat = channel;
    if (channel.type === ChannelType.GuildForum && !entry.forum) entry.forum = channel;
    troops.set(troop, entry);
  }
  return troops;
}

/** Thrown when a troop channel already holds a human-written overwrite for the target. */
export class ForeignOverwriteError extends Error {
  constructor(troop, channel) {
    super(`avd ${troop}: ${channel.id} har redan en overwrite för deltagaren som inte är en tystnad`);
    this.name = "ForeignOverwriteError";
    this.troop = troop;
    this.channel = channel;
  }
}

export class MuteRegistry {
  constructor(client) {
    this.client = client;
    /** `${troop}:${userId}` → { troop, userId, until, timer } */
    this.active = new Map();
  }

  key(troop, userId) {
    return `${troop}:${userId}`;
  }

  /** Mutes userId in troop until `until`; posts the notice in the troop chat. */
  async mute(guild, { troop, userId, until, byId, reason }) {
    const entry = troopChannels(guild).get(troop);
    if (!entry) throw new Error(`Hittar inga kanaler för avdelning ${troop}`);

    // edit() merges into whatever overwrite is already there. Merging the
    // deny bits into a human-written overwrite would leave something that is
    // neither that overwrite nor a mute — unliftable by us, unexplained to
    // them. Refuse up front instead; a Moderator can sort it out by hand.
    for (const channel of entry.channels) {
      const existing = channel.permissionOverwrites.cache.get(userId);
      if (existing && !isMute(existing, this.client.user.id)) {
        throw new ForeignOverwriteError(troop, channel);
      }
    }

    const auditReason = `tysta av ${byId} till ${until.toISOString()}`;
    for (const channel of entry.channels) {
      await channel.permissionOverwrites.edit(userId, DENY, {
        type: OverwriteType.Member,
        reason: auditReason,
      });
    }

    if (entry.chat) {
      await entry.chat.send({
        content: muteMessage({ userId, until, byId, reason }),
        allowedMentions: { users: [userId] },
      });
    }

    this.schedule(guild, troop, userId, until);
    console.log(`🔇 avd ${troop}: ${userId} tystad till ${until.toISOString()}`);
    return entry;
  }

  /** Removes the overwrites in the troop's channels. Returns false if there were none. */
  async lift(guild, { troop, userId, announce = true }) {
    const entry = troopChannels(guild).get(troop);
    if (!entry) throw new Error(`Hittar inga kanaler för avdelning ${troop}`);

    let found = false;
    for (const channel of entry.channels) {
      const overwrite = channel.permissionOverwrites.cache.get(userId);
      if (!overwrite) continue;
      if (!isMute(overwrite, this.client.user.id)) {
        console.warn(`avd ${troop}: overwrite för ${userId} i ${channel.id} är ingen tystnad — rör den inte`);
        continue;
      }
      await channel.permissionOverwrites.delete(userId, "tystnad hävd");
      found = true;
    }

    this.forget(troop, userId);
    if (found && announce && entry.chat) {
      await entry.chat.send({
        content: liftMessage({ userId }),
        allowedMentions: { users: [userId] },
      });
    }
    if (found) console.log(`🔈 avd ${troop}: ${userId} kan skriva igen`);
    return found;
  }

  schedule(guild, troop, userId, until) {
    this.forget(troop, userId);
    const delay = Math.max(0, until.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.lift(guild, { troop, userId }).catch((error) =>
        console.error(`Kunde inte häva tystnad i avd ${troop}:`, error)
      );
    }, delay);
    timer.unref?.();
    this.active.set(this.key(troop, userId), { troop, userId, until, timer });
  }

  forget(troop, userId) {
    const existing = this.active.get(this.key(troop, userId));
    if (existing) clearTimeout(existing.timer);
    this.active.delete(this.key(troop, userId));
  }

  /** Active mutes in the given troops, soonest expiry first. */
  list(troops) {
    return [...this.active.values()]
      .filter((m) => troops.includes(m.troop))
      .sort((a, b) => a.until - b.until);
  }

  /**
   * After a restart: find every mute-shaped member overwrite in the troop
   * channels (see isMute), read its expiry back from the bot's own notice in
   * the chat, and either reschedule it or lift it. wsj27-infra only writes
   * role overwrites there, so a deny-only member overwrite is ours; a member
   * overwrite of any other shape is somebody else's and is left untouched.
   */
  async reconcile(guild) {
    const me = this.client.user;
    let kept = 0;
    let lifted = 0;

    for (const entry of troopChannels(guild).values()) {
      const muted = new Set();
      for (const channel of entry.channels) {
        for (const overwrite of channel.permissionOverwrites.cache.values()) {
          if (isMute(overwrite, me.id)) {
            muted.add(overwrite.id);
          } else if (overwrite.type === OverwriteType.Member && overwrite.id !== me.id) {
            console.warn(`avd ${entry.troop}: främmande member-overwrite för ${overwrite.id} i ${channel.id} lämnas orörd`);
          }
        }
      }
      if (muted.size === 0) continue;

      const expiry = new Map();
      try {
        const messages = entry.chat ? await entry.chat.messages.fetch({ limit: 100 }) : new Map();
        for (const message of messages.values()) {
          if (message.author.id !== me.id) continue;
          const parsed = parseMuteMessage(message.content);
          if (!parsed || !muted.has(parsed.userId)) continue;
          // fetch() returns newest first; keep the newest notice per user.
          if (expiry.has(parsed.userId)) continue;
          // A notice can only have been written by this bot, but it is still
          // read back as data: never trust it past the longest mute on offer.
          const ceiling = (message.createdTimestamp ?? Date.now()) + MAX_MUTE_MS;
          expiry.set(parsed.userId, new Date(Math.min(parsed.until.getTime(), ceiling)));
        }
      } catch (error) {
        // No history → no expiries → every mute below is lifted. Say why.
        console.error(`Kunde inte läsa tystnadsnotiser i avd ${entry.troop}:`, error);
      }

      for (const userId of muted) {
        const until = expiry.get(userId);
        if (until && until.getTime() > Date.now()) {
          this.schedule(guild, entry.troop, userId, until);
          kept += 1;
        } else {
          await this.lift(guild, { troop: entry.troop, userId });
          lifted += 1;
        }
      }
    }

    console.log(`🔇 tystnader efter start: ${kept} kvar, ${lifted} hävda`);
  }
}

/** Role names of a GuildMember, the shape authorize() wants. */
export function roleNames(member) {
  return member.roles.cache.map((role) => role.name);
}

/** Troops the member leads (Ledare-NN), or all if admin. */
export function leaderTroops(member, guild) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return [...troopChannels(guild).keys()].sort();
  }
  return [...troopsFromRoles(roleNames(member), "leader")].sort();
}
