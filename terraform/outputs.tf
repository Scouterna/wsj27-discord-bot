output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.main.name
}

output "storage_account_name" {
  description = "Name of the storage account for persistent data"
  value       = azurerm_storage_account.data.name
}

output "share_name" {
  description = "Azure Files share mounted by the pod at /persistent"
  value       = azurerm_storage_share.data.name
}

# container_app_name and deployment_commands are gone with the Container App.
# The bot now runs on Kubernetes: push to main and GitHub Actions builds to
# ghcr.io/scouterna/wsj27-discord-bot and applies k8s/. See ../k8s/ and the
# workflow in ../.github/workflows/deploy.yml.
