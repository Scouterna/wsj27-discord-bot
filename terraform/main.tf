terraform {
  required_version = ">= 1.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
}

# Reference shared resources (created by discord-scoutid terraform)
data "azurerm_resource_group" "shared" {
  name = "rg-wsj27-shared-${var.location-abbr}"
}

data "azurerm_container_registry" "main" {
  name                = replace("acr-wsj27-${var.environment}-${var.location-abbr}", "-", "")
  resource_group_name = data.azurerm_resource_group.shared.name
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = "rg-${var.project_name}-${var.environment}-${var.location-abbr}"
  location = var.location
  tags     = var.tags
}

# Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "main" {
  name                = "logs-${var.project_name}-${var.environment}-${var.location-abbr}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

# Container Apps Environment
resource "azurerm_container_app_environment" "main" {
  name                       = "appenv-${var.project_name}-${var.environment}-${var.location-abbr}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  tags                       = var.tags
}

# Storage Account for persistent data (claims.json)
resource "azurerm_storage_account" "data" {
  name                     = replace("st-${var.project_name}-${var.environment}-${var.location-abbr}", "-", "")
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  tags                     = var.tags
}

resource "azurerm_storage_share" "data" {
  name                 = "bot-data"
  storage_account_name = azurerm_storage_account.data.name
  quota                = 1
}

# Link storage to Container Apps Environment
resource "azurerm_container_app_environment_storage" "data" {
  name                         = "botdata"
  container_app_environment_id = azurerm_container_app_environment.main.id
  account_name                 = azurerm_storage_account.data.name
  share_name                   = azurerm_storage_share.data.name
  access_key                   = azurerm_storage_account.data.primary_access_key
  access_mode                  = "ReadWrite"
}

# Container App (no ingress - Discord gateway bot)
resource "azurerm_container_app" "main" {
  name                         = "app-${var.project_name}-${var.environment}-${var.location-abbr}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = var.tags

  template {
    min_replicas = 1 # Gateway bot must always be running
    max_replicas = 1

    volume {
      name         = "data-volume"
      storage_name = azurerm_container_app_environment_storage.data.name
      storage_type = "AzureFile"
    }

    container {
      name   = "discord-wsj27-bot"
      image  = "${data.azurerm_container_registry.main.login_server}/${var.docker_image_name}:${var.docker_image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      volume_mounts {
        name      = "data-volume"
        path      = "/persistent"
      }

      env {
        name  = "CLAIMS_PATH"
        value = "/persistent/claims.json"
      }

      env {
        name        = "DISCORD_TOKEN"
        secret_name = "discord-token"
      }

      env {
        name        = "DISCORD_CLIENT_ID"
        secret_name = "discord-client-id"
      }

      env {
        name        = "DISCORD_GUILD_ID"
        secret_name = "discord-guild-id"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
    }
  }

  secret {
    name  = "discord-token"
    value = var.discord_token
  }

  secret {
    name  = "discord-client-id"
    value = var.discord_client_id
  }

  secret {
    name  = "discord-guild-id"
    value = var.discord_guild_id
  }

  secret {
    name  = "acr-password"
    value = data.azurerm_container_registry.main.admin_password
  }

  registry {
    server               = data.azurerm_container_registry.main.login_server
    username             = data.azurerm_container_registry.main.admin_username
    password_secret_name = "acr-password"
  }

  # No ingress block - this is a Discord gateway bot, no HTTP needed
}
