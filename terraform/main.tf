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

# The shared resource group and container registry used to be read here. The
# registry is being deleted along with the Container App — images now come from
# ghcr.io/scouterna/wsj27-discord-bot — and a `data` block referring to a
# resource that no longer exists fails every plan.

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = "rg-${var.project_name}-${var.environment}-${var.location-abbr}"
  location = var.location
  tags     = var.tags
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

