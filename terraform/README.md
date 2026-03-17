# WSJ27 Bot - Azure Infrastructure

Terraform configuration for deploying the WSJ27 name-claiming Discord bot to Azure Container Apps.

## Prerequisites

- The shared resources (ACR, DNS) must already exist from the `discord-scoutid-linked-role` terraform
- Azure CLI installed and logged in (`az login`)
- Terraform >= 1.0

## Architecture

- **Container App** - Runs the Discord gateway bot (always-on, no HTTP ingress)
- **Azure Files** - Persistent storage for `claims.json`
- **Shared ACR** - `acrwsj27prodsec` (managed by scoutid terraform)

## Deploy

```bash
# First time
cp secrets.tfvars.example secrets.tfvars
# Edit secrets.tfvars with your Discord credentials

terraform init
terraform plan -var-file="secrets.tfvars"
terraform apply -var-file="secrets.tfvars"
```

## Build & push Docker image

```bash
az acr login --name acrwsj27prodsec

docker build --no-cache -t acrwsj27prodsec.azurecr.io/discord-wsj27-bot:latest .
docker push acrwsj27prodsec.azurecr.io/discord-wsj27-bot:latest

az containerapp update \
  --name app-discord-wsj27-bot-prod-sec \
  --resource-group rg-discord-wsj27-bot-prod-sec \
  --image acrwsj27prodsec.azurecr.io/discord-wsj27-bot:latest
```

## View logs

```bash
az containerapp logs show \
  --name app-discord-wsj27-bot-prod-sec \
  --resource-group rg-discord-wsj27-bot-prod-sec \
  --follow
```

## Deploy slash commands (once)

```bash
docker run --rm --env-file .env acrwsj27prodsec.azurecr.io/discord-wsj27-bot:latest node src/deploy-commands.js
```
