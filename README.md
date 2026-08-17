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
k8s/                      Kubernetes manifests (deployed by CI)
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

The bot runs on Kubernetes — namespace `wsj27` on Scouterna's shared AKS cluster
`webservices`, alongside `discord-scoutid` and `scoutview`. Manifests are in
[k8s/](k8s/), images in GHCR.

Pushing to `main` builds the image and applies the manifests; see
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). The workflow ends
by confirming the bot reconnected to Discord, which is the only check that
means anything for a gateway bot — see Troubleshooting.

There is no Service and no Ingress: nothing talks to this bot over HTTP.

```bash
export KUBECONFIG=~/.kube/wsj27.yaml   # ~/.kube/config is rancher-desktop

kubectl get pods -l app=discord-wsj27-bot
kubectl logs -l app=discord-wsj27-bot --tail=50 --prefix
kubectl rollout status deploy/discord-wsj27-bot
kubectl rollout undo deploy/discord-wsj27-bot
```

**Always tag images with the git SHA, never `latest`** — a mutable tag makes
`rollout undo` ambiguous, because two different images share one name.

Break-glass manual deploy. `kubectl apply -k k8s/` alone gives
`ImagePullBackOff`: the committed tag is a placeholder that CI rewrites in its
own checkout, so name the tag explicitly and revert the edit afterwards.

```bash
IMG=ghcr.io/scouterna/wsj27-discord-bot
(cd k8s && kustomize edit set image "$IMG=$IMG:$(git rev-parse --short HEAD)")
kubectl apply -k k8s/
```

Two Secrets are created imperatively rather than declared in git — the cluster
has no sealed-secrets, so a Secret in the repo would be plaintext:
`discord-wsj27-bot-secrets` and `wsj27-bot-storage`.

### Deploy slash commands

```bash
docker run --rm --env-file .env ghcr.io/scouterna/wsj27-discord-bot:<sha> node src/deploy-commands.js
```

Guild command registration fails with `50001 Missing Access` until the bot is
actually a member of the guild.

## Storage — none, but the Azure resources are still there

The bot writes nothing. It holds no state, mounts no volume and reads no files
beyond its own source.

An Azure Files share was mounted at `/persistent` for `claims.json` until the
name-claiming feature went. The share never held anything, because the bot never
successfully served a request. Three resources outlive it, managed in
[Scouterna/wsj27-infra](https://github.com/Scouterna/wsj27-infra)
(`azure/wsj27_bot.tf`):

| Resource | Name |
| --- | --- |
| Resource group | `rg-discord-wsj27-bot-prod-sec` |
| Storage account | `stdiscordwsj27botprodsec` |
| File share | `bot-data` |

Plus the `wsj27-bot-storage` Secret in namespace `wsj27`. Nothing reads any of
it. Deleting them would remove this bot's last Azure dependency; they are kept
only in case the feature comes back in some form.

## Troubleshooting

- **Bot doesn't respond**: Check if commands are deployed (`npm run deploy`), verify bot permissions
- **Bot appears healthy but does nothing**: check the guild count, not the pod.
  `kubectl logs -l app=discord-wsj27-bot` must show `Serving 1 guilds`. It read
  `0` from the AKS migration until 2026-08-16 while every pod-level signal
  stayed green. Inviting the bot needs Manage Server in the Discord UI and
  cannot be done from Terraform.
- **Commands not showing**: Run `npm run deploy`. Guild commands appear instantly; global commands take up to 1 hour
