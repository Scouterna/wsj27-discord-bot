// Patrol threads stay open.
//
// A patrol has no channel of its own: Discord caps a server at 500 channels
// and 250 roles, and four patrols in each of 53 troops would need more of
// both. Instead each patrol holds its conversation in a private thread in the
// troop chat (#NN-djur-chat). Discord archives a thread after a stretch with
// no messages — one week at most — and an archived thread drops out of the
// sidebar, so a quiet patrol thinks its chat is gone.
//
// The bot puts it back. When a private thread in a troop chat is archived it
// unarchives it at once, and raises the thread's own inactivity window to the
// one-week maximum while it is at it, so it wakes at most once a week per
// thread. Nothing is posted and no one is notified. On startup it does the
// same for every private thread archived while it was offline.
//
// A *locked* thread is left alone: that is how a leader closes a patrol thread
// for good. Plain archiving cannot be told apart from Discord's own timeout
// without reading the audit log, which the bot has no access to.
//
// Public threads in the chat are not touched — those are for a passing topic
// and are meant to fade.

import { ChannelType } from "discord.js";
import { troopChannels } from "./mutes.js";

/** Discord's longest auto-archive window, in minutes (one week). */
export const MAX_AUTO_ARCHIVE = 10080;

/**
 * Troop chats — the channels whose private threads are patrol threads — as
 * chat id → troop number.
 */
export function troopChatIds(guild) {
  const ids = new Map();
  for (const entry of troopChannels(guild).values()) {
    if (entry.chat) ids.set(entry.chat.id, entry.troop);
  }
  return ids;
}

/** Is this an archived, unlocked patrol thread that should be reopened? */
export function shouldReopen(thread, chatIds) {
  return (
    thread.type === ChannelType.PrivateThread &&
    thread.archived === true &&
    thread.locked !== true &&
    chatIds.has(thread.parentId)
  );
}

/** Unarchive and stretch the inactivity window to the maximum, in one edit. */
export async function reopen(thread) {
  await thread.edit({
    archived: false,
    autoArchiveDuration: MAX_AUTO_ARCHIVE,
    reason: "Patrulltråden hålls öppen",
  });
}

/**
 * Reopens every archived private thread in the troop chats. Run on startup,
 * for the threads that were archived while the bot was not listening.
 * Returns how many were reopened.
 */
export async function sweep(guild, log = () => {}) {
  const chatIds = troopChatIds(guild);
  let reopened = 0;
  for (const chatId of chatIds.keys()) {
    const chat = guild.channels.cache.get(chatId);
    let before;
    for (;;) {
      // fetchAll: every archived private thread, not just ones the bot is in.
      // Needs Manage Threads and Read Message History in the chat.
      const page = await chat.threads.fetchArchived({ type: "private", fetchAll: true, before, limit: 100 });
      for (const thread of page.threads.values()) {
        if (!shouldReopen(thread, chatIds)) continue;
        try {
          await reopen(thread);
          reopened += 1;
          log(`🧵 avd ${chatIds.get(chatId)}: patrulltråden <#${thread.id}> öppnades igen (arkiverades medan boten var nere)`);
        } catch (error) {
          console.error(`Kunde inte öppna tråd ${thread.id} i ${chat.name}:`, error);
        }
      }
      if (!page.hasMore || page.threads.size === 0) break;
      // Pages run newest-archived first; continue from the oldest seen.
      const oldest = Math.min(...page.threads.map((t) => t.archivedAt?.getTime() ?? Infinity));
      if (!Number.isFinite(oldest) || oldest === before) break;
      before = oldest;
    }
  }
  return reopened;
}
