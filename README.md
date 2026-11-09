# Discord WSJ27 Bot

A Discord bot for WSJ 2027 Sverige. It lets a troop's leaders mute a
participant in the troop's own channels for a while (`/tysta`), and confirms it
is running (`/ping`).

The bot was written to let troops claim unique names from a fixed list —
`/take`, `/return`, `/list`, backed by a `claims.json` on an Azure Files share.
That feature was removed on 2026-08-17 because it is not going to be used. It
had also never worked: troop detection matched roles against
`/^Avd (\d{1,2}) .*$/`, and the WSJ27 guild has no such role — its troop roles
are `Deltagare-01` and `Ledare-01`, created by Terraform in
[Scouterna/wsj27-infra](https://github.com/Scouterna/wsj27-infra)
(`discord/roles.tf`). Checked against all 218 roles at the time, which also
included a per-troop `Avdelningssupport-Avd-01` (removed 2026-10-13): zero
matches. The bot was
in no guild at all until 2026-08-16, so the commands had never been reachable to
fail. `git log` has the code if any of it is wanted back.

## Commands

| Command | Who | Description |
|---------|-----|-------------|
| `/ping` | anyone who can use slash commands | Replies, ephemerally, with uptime and guild count |
| `/tysta deltagare tid [anledning]` | `Ledare-NN`, administrators | Mutes a participant in troop NN's channels for 10 min – 1 week |
| `/häv-tystnad deltagare` | same | Lifts a mute early |
| `/tystade` | same | Lists the active mutes in the caller's troops |

### How `/tysta` works

Discord's own timeout ("Timeout Members") is guild-wide and cannot be scoped to
a channel, so a leader holding it could silence any participant everywhere. The
bot instead does what a leader with Manage Permissions would do by hand: it
writes a **member overwrite** for the participant in each of the troop's
participant channels that denies Send Messages, Send Messages in Threads, Add
Reactions, Create Public Threads and Create Private Threads, and deletes the
overwrite when the time is up. Reading is untouched.

- **Which channels are "the troop's"** is read off the guild: every text or
  forum channel whose overwrites let in exactly one `Deltagare-NN` role (View
  Channel allowed) belongs to troop NN (`troopChannels` in `src/mutes.js`). On
  the WSJ27 server that is `#NN-djur-chat` and `#NN-djur-ledarinfo`. A channel
  added to the troop in wsj27-infra is covered without a change here; a channel
  shared by several troops is nobody's to mute in and is skipped.
- **Who may mute whom** (`authorize` in `src/tysta.js`): the target must hold
  `Deltagare-NN` and nothing staff-like; the caller must hold `Ledare-NN` for
  that NN, or Administrator. Leaders and CMT can never be muted by this. Role *names* are the contract — wsj27-infra
  `discord/roles.tf` owns them, and a rename there breaks this silently.
- **The notice is the state.** The bot posts
  `🔇 @X är tystad i avdelningens kanaler till <t:EPOCH:f> (av @Y). Anledning: …`
  in the troop chat, and `🔈 @X kan skriva igen.` when it lifts. After a restart
  it reads the last 100 messages of each chat that has member overwrites, takes
  the newest notice per muted user, and either reschedules or lifts. A mute
  whose notice is gone (deleted, or scrolled past 100 messages) is lifted —
  failing open is the right failure for 14-year-olds. Keep `muteMessage` and
  `parseMuteMessage` in step.
- **Only its own overwrites.** A mute is recognised by shape: a member
  overwrite that allows nothing and denies exactly the five bits above
  (`isMute`). A member overwrite of any other shape — one a moderator wrote by
  hand — is never lifted or reconciled, only logged. The notice is read back as
  data, not trusted: the parser is anchored to the fixed text so the reason
  cannot reach the timestamp, and an expiry further out than the longest
  offered mute after the notice was posted is clamped to that.
- **Visibility.** The commands carry no `default_member_permissions`; the
  bot's own check is the gate. Participants cannot use slash commands at all on
  the WSJ27 server (`@everyone` is 0; `Avdelningsledare` and `CMT` carry
  USE_APPLICATION_COMMANDS), so they do not even see `/tysta`.

### Permissions the bot needs

The bot has no role on the WSJ27 server (invited with `permissions=0`). What it
needs is a `type = "user"` overwrite on its user id in each troop channel,
managed in wsj27-infra `discord/permissions.tf` (`troop_chat_wsj27_bot`,
`troop_forum_wsj27_bot`):

| Channel | Allow |
|---------|-------|
| `#NN-djur-chat` | View Channel, Read Message History, Send Messages, Manage Permissions |
| `#NN-djur-ledarinfo` | View Channel, Manage Permissions |

Manage Permissions *as a channel overwrite* is what lets the bot deny bits it
does not hold itself — Discord otherwise only allows a bot to allow/deny
permissions it has. Nothing guild-wide is required: no audit log, no Moderate
Members, no view of other channels. The bot logs the user id it runs as on
startup (`Serving N guilds as user …`); that is the id the overwrites must
target. A `50013 Missing Permissions` on `/tysta` means an overwrite is missing
or the id is wrong, not that the token is.

## Project structure

```
src/
├── index.js              Gateway client, activity, command handlers
├── deploy-commands.js    Slash command registration
├── tysta.js              Pure logic: role parsing, authorization, durations, notice format
├── mutes.js              Discord side: find troop channels, write/remove overwrites, reconcile
└── commands/
    └── index.js          Slash command definitions
test/                     node --test; `npm test`
```

## Setup

### 1. Configure environment

```bash
cp .env.example .env
# Fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
```

### 2. Deploy slash commands (once)

```bash
npm run deploy
```

### 3. Run locally

```bash
npm install
npm start
```

Or with Docker:

```bash
docker-compose up -d
```

## Deployment

This repository builds the image and nothing else.
[publish.yml](.github/workflows/publish.yml) runs on every push to `main` and
pushes `ghcr.io/scouterna/wsj27-discord-bot:<sha7>` — the short commit SHA,
never `latest`. There are no Kubernetes manifests here any more.

The bot is deployed from [Scouterna/wsj27-infra](https://github.com/Scouterna/wsj27-infra):
[`k8s/prod/discord-wsj27-bot.yaml`](https://github.com/Scouterna/wsj27-infra/blob/main/k8s/prod/discord-wsj27-bot.yaml),
applied by ArgoCD to namespace `proj-wsj27-prod` on Scouterna's
`webservices-v2` cluster. **To release, set the image tag there to the new
`<sha7>` and commit**; to roll back, set the previous one. The secret
`discord-wsj27-bot-secrets` (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`,
`DISCORD_GUILD_ID`) is a SealedSecret beside it. How to rotate it, and how to
look at the running pod with the team's read-only access, is in that repo's
[`k8s/discord-bots.md`](https://github.com/Scouterna/wsj27-infra/blob/main/k8s/discord-bots.md).

It runs **exactly one replica**: this is a gateway bot, and a second instance
opens its own gateway session and answers every command twice. There is no
Service and no Ingress: nothing talks to this bot over HTTP.

### Deploy slash commands

```bash
docker run --rm --env-file .env ghcr.io/scouterna/wsj27-discord-bot:<sha> node src/deploy-commands.js
```

Guild command registration fails with `50001 Missing Access` until the bot is
actually a member of the guild.

## Storage — none

The bot holds no state of its own, mounts no volume and reads no files beyond
its own source. The one thing it needs to remember — when each mute ends — it
writes into Discord itself, as the notice in the troop chat (see *How `/tysta`
works*), and reads back on startup. Restarting it loses nothing, and a mute
survives a restart as long as its notice does.

It used to mount an Azure Files share at `/persistent` for `claims.json`. The
share, its storage account `stdiscordwsj27botprodsec`, the resource group around
them and the `wsj27-bot-storage` Secret were all deleted on 2026-08-17 together
with the feature that used them. The share had never held a byte — the bot never
successfully served a request. **This repository has no Azure dependency of any
kind now**: it builds to GHCR, and runs wherever wsj27-infra deploys it.

## Troubleshooting

- **Bot doesn't respond**: Check if commands are deployed (`npm run deploy`), verify bot permissions
- **A leader does not see `/tysta`**: they lack USE_APPLICATION_COMMANDS in that
  channel. On the WSJ27 server it sits on the `Avdelningsledare` marker, which
  the ScoutID bot grants on linking — an unlinked leader has no commands.
- **`/tysta` answers "Boten saknar behörighet"**: the bot's overwrite in that
  troop's channel is missing or points at the wrong id. Compare the id in the
  startup log with `local.wsj27_bot_user_id` in wsj27-infra.
- **Bot appears healthy but does nothing**: check the guild count, not the pod.
  `kubectl -n proj-wsj27-prod logs -l app=discord-wsj27-bot` must show
  `Serving 1 guilds`. It read
  `0` from the AKS migration until 2026-08-16 while every pod-level signal
  stayed green. Inviting the bot needs Manage Server in the Discord UI and
  cannot be done from Terraform.
- **Commands not showing**: Run `npm run deploy`. Guild commands appear instantly; global commands take up to 1 hour
