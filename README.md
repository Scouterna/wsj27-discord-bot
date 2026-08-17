# Discord WSJ27 Bot

A Discord bot for managing name claims with troop-based restrictions. Troops can claim unique names from a predefined list, with only one name per troop allowed.

## Commands

| Command | Description |
|---------|-------------|
| `/take <name>` | Claim a name for your troop (autocomplete shows available names) |
| `/return <name>` | Return your troop's claimed name (autocomplete shows your names) |
| `/list [available_only]` | Show all names and their claim status |

- Each troop can only hold one name at a time

> **Known issue: nobody can use these commands.** Troop detection in
> [`src/utils/troops.js`](src/utils/troops.js) matches roles against
> `/^Avd (\d{1,2}) .*$/` — a name like `Avd 1 Alfa`, note the required space and
> trailing text. No such role exists in the WSJ27 guild. Its troop roles are
> named `Deltagare-01`, `Ledare-01` and `Avdelningssupport-Avd-01`, created by
> Terraform in `Scouterna/wsj27-infra` (`discord/roles.tf`). Checked against all
> 218 roles on 2026-08-17: zero matches, so `/take`, `/return` and `/list`
> answer "No Troop Role" for everyone. The bot only joined the guild on
> 2026-08-16, so this has never worked in practice. Either the pattern follows
> the roles that exist, or the roles it expects have to be created.

## Project structure

```
src/
├── index.js              Main bot file (discord.js gateway)
├── deploy-commands.js    One-time slash command registration
├── storage.js            JSON file persistence (names + claims)
├── commands/
│   └── index.js          Slash command definitions
└── utils/
    └── troops.js         Troop role detection utilities
data/
├── names.json            Static list of 40 names
└── claims.json           Dynamic claims data (auto-generated)
k8s/                      Kubernetes manifests (deployed by CI)
terraform/                Legacy Azure Container Apps config — no longer deploys
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

### Legacy Azure infrastructure

`terraform/` describes the Azure Container Apps setup this bot ran on until the
AKS migration. **It no longer deploys anything** — the container registry it
references, `acrwsj27prodsec`, has been deleted. Only the Azure Files share for
`claims.json` is still live. See `Scouterna/wsj27-infra` (`azure/`) for what
remains in the subscription.

## Data persistence

- `data/names.json` — Static list of names, baked into the Docker image
- `claims.json` — Dynamic claims, persisted in Azure Files (mounted at `/persistent/claims.json` in production, configurable via `CLAIMS_PATH` env var)

Claims survive container restarts and redeployments.

## Troubleshooting

- **Bot doesn't respond**: Check if commands are deployed (`npm run deploy`), verify bot permissions
- **"No Troop Role" error**: expected — see the known issue under Commands. The
  role pattern matches nothing in this guild.
- **Bot appears healthy but does nothing**: check the guild count, not the pod.
  `kubectl logs -l app=discord-wsj27-bot` must show `Serving 1 guilds`. It read
  `0` from the AKS migration until 2026-08-16 while every pod-level signal
  stayed green. Inviting the bot needs Manage Server in the Discord UI and
  cannot be done from Terraform.
- **Commands not showing**: Run `npm run deploy`. Guild commands appear instantly; global commands take up to 1 hour
- **Lost claims after restart**: Make sure `CLAIMS_PATH` points to the Azure Files mount (`/persistent/claims.json`)
