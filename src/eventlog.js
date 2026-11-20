// What the bot did, written to a moderator-only channel (#server-logg) so
// moderators can see it without reading pod logs. LOG_CHANNEL_ID unset turns
// it off. The ScoutID bot writes to the same channel, in the same shape
// (discord-scoutid-linked-role, src/eventlog.js).
//
// Three rules, the same as there: never throw into a caller (a failed log
// write must not fail a /tysta), never delay a caller (lines are buffered and
// sent on a timer), and flush on shutdown.

const FLUSH_INTERVAL_MS = 3000;
const MAX_MESSAGE_CHARS = 1900;
const MAX_QUEUE_LINES = 500;

/** Discord renders this in each viewer's own timezone. */
const stamp = (now) => `<t:${Math.floor(now / 1000)}:T>`;

/**
 * `send(text)` posts one message; it is the only thing that touches Discord,
 * so tests pass a fake. Returns `{ log, flush, stop }`.
 */
export function createEventLog({ send, intervalMs = FLUSH_INTERVAL_MS, now = Date.now } = {}) {
  const queue = [];
  let dropped = 0;
  let flushing = false;
  let timer = null;

  function log(line) {
    if (!send) return;
    if (queue.length >= MAX_QUEUE_LINES) {
      dropped += 1;
      return;
    }
    queue.push(`${stamp(now())} ${line}`);
    if (!timer) {
      timer = setInterval(() => void flush(), intervalMs);
      timer.unref?.();
    }
  }

  async function flush() {
    if (!send || flushing || queue.length === 0) return;
    flushing = true;
    try {
      while (queue.length > 0) {
        let body = "";
        while (queue.length > 0 && body.length + queue[0].length + 1 <= MAX_MESSAGE_CHARS) {
          body += (body ? "\n" : "") + queue.shift();
        }
        if (!body) body = queue.shift().slice(0, MAX_MESSAGE_CHARS);
        if (dropped > 0) {
          body += `\n⚠️ ${dropped} rad(er) tappade — kön full.`;
          dropped = 0;
        }
        await send(body);
      }
    } catch (error) {
      // The same lines are in the pod log; holding them for a channel we
      // cannot write to only grows the queue.
      console.error(`eventlog: kunde inte skriva till loggkanalen: ${error.message}`);
      queue.length = 0;
    } finally {
      flushing = false;
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { log, flush, stop };
}

/** Markdown-escape a display name so `*`, `_` etc. in it render literally. */
function escape(text) {
  return text.replace(/([\\*_~`|>])/g, "\\$1");
}

/**
 * How a person is written in a log line: `**Namn**`, or the raw id when the
 * member cannot be found. Not a `<@id>` mention: without pinging, a client that
 * has not cached the member shows it as an unknown user (see the ScoutID bot's
 * `who()` for the long version).
 */
export async function who(guild, userId) {
  if (!userId) return "okänd";
  let member = guild.members?.cache?.get(userId);
  if (!member) member = await guild.members?.fetch?.(userId).catch(() => null);
  return member ? `**${escape(member.displayName)}**` : `\`${userId}\``;
}
