# Discord WSJ27 Bot

A Discord bot for WSJ 2027 Sverige. It currently does one thing: hold a gateway
connection and confirm it is running.

The bot was written to let troops claim unique names from a fixed list —
`/take`, `/return`, `/list`, backed by a `claims.json` on an Azure Files share.
That feature was removed on 2026-08-17 because it is not going to be used. It
had also never worked: troop detection matched roles against
`/^Avd (\d{1,2}) .*$/`, and the WSJ27 guild has no such role — its troop roles
are `Deltagare-01`, `Ledare-01` and `Avdelningssupport-Avd-01`, created by
Terraform in [Scouterna/wsj27-infra](https://github.com/Scouterna/wsj27-infra)
(`discord/roles.tf`). Checked against all 218 roles: zero matches. The bot was
in no guild at all until 2026-08-16, so the commands had never been reachable to
fail. `git log` has the code if any of it is wanted back.

## Commands

| Command | Description |
|---------|-------------|
| `/ping` | Replies, ephemerally, with uptime and guild count |

## Project structure

```
src/
├── index.js              Gateway client, activity, /ping
├── deploy-commands.js    Slash command registration
└── commands/
    └── index.js          Slash command definitions
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

The bot writes nothing. It holds no state, mounts no volume and reads no files
beyond its own source. Restarting it loses nothing, because there is nothing to
lose.

It used to mount an Azure Files share at `/persistent` for `claims.json`. The
share, its storage account `stdiscordwsj27botprodsec`, the resource group around
them and the `wsj27-bot-storage` Secret were all deleted on 2026-08-17 together
with the feature that used them. The share had never held a byte — the bot never
successfully served a request. **This repository has no Azure dependency of any
kind now**: it builds to GHCR, and runs wherever wsj27-infra deploys it.

## Troubleshooting

- **Bot doesn't respond**: Check if commands are deployed (`npm run deploy`), verify bot permissions
- **Bot appears healthy but does nothing**: check the guild count, not the pod.
  `kubectl -n proj-wsj27-prod logs -l app=discord-wsj27-bot` must show
  `Serving 1 guilds`. It read
  `0` from the AKS migration until 2026-08-16 while every pod-level signal
  stayed green. Inviting the bot needs Manage Server in the Discord UI and
  cannot be done from Terraform.
- **Commands not showing**: Run `npm run deploy`. Guild commands appear instantly; global commands take up to 1 hour
