# Discord WSJ27 Bot

A Discord bot for managing name claims with troop-based restrictions. Troops can claim unique names from a predefined list, with only one name per troop allowed.

## Commands

| Command | Description |
|---------|-------------|
| `/take <name>` | Claim a name for your troop (autocomplete shows available names) |
| `/return <name>` | Return your troop's claimed name (autocomplete shows your names) |
| `/list [available_only]` | Show all names and their claim status |

- Users must have a role matching `Avd {number}` (e.g. "Avd 1", "Avd 42") to participate
- Each troop can only hold one name at a time

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
terraform/                Azure infrastructure (Container Apps)
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

## Deployment to Azure

Infrastructure is managed with Terraform in `terraform/` (Azure Container Apps + Azure Files for persistent storage).

### Prerequisites

The shared ACR (`acrwsj27prodsec`) must already exist (created by the `discord-scoutid-linked-role` terraform).

### First-time setup

```bash
cd terraform
cp secrets.tfvars.example secrets.tfvars
# Fill in Discord credentials

terraform init
terraform plan -var-file="secrets.tfvars"
terraform apply -var-file="secrets.tfvars"
```

### Build and push Docker image

Build from WSL (uses Sectra npm registry):

```bash
# Login to Azure and ACR
az login
az acr login --name acrwsj27prodsec

# Build and push
docker build --no-cache -t acrwsj27prodsec.azurecr.io/discord-wsj27-bot:latest .
docker push acrwsj27prodsec.azurecr.io/discord-wsj27-bot:latest
```

### Update a running deployment

```bash
az containerapp update \
  --name app-discord-wsj27-bot-prod-sec \
  --resource-group rg-discord-wsj27-bot-prod-sec \
  --image acrwsj27prodsec.azurecr.io/discord-wsj27-bot:latest
```

### Deploy slash commands from Docker

```bash
docker run --rm --env-file .env acrwsj27prodsec.azurecr.io/discord-wsj27-bot:latest node src/deploy-commands.js
```

### View logs

```bash
az containerapp logs show \
  --name app-discord-wsj27-bot-prod-sec \
  --resource-group rg-discord-wsj27-bot-prod-sec \
  --follow
```

## Data persistence

- `data/names.json` — Static list of names, baked into the Docker image
- `claims.json` — Dynamic claims, persisted in Azure Files (mounted at `/persistent/claims.json` in production, configurable via `CLAIMS_PATH` env var)

Claims survive container restarts and redeployments.

## Troubleshooting

- **Bot doesn't respond**: Check if commands are deployed (`npm run deploy`), verify bot permissions
- **"No Troop Role" error**: User needs a role named `Avd {number}` (e.g. "Avd 1")
- **Commands not showing**: Run `npm run deploy`. Guild commands appear instantly; global commands take up to 1 hour
- **Lost claims after restart**: Make sure `CLAIMS_PATH` points to the Azure Files mount (`/persistent/claims.json`)
