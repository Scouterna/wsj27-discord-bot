output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.main.name
}

output "container_app_name" {
  description = "Name of the container app"
  value       = azurerm_container_app.main.name
}

output "storage_account_name" {
  description = "Name of the storage account for persistent data"
  value       = azurerm_storage_account.data.name
}

output "deployment_commands" {
  description = "Commands to build and deploy"
  value       = <<-EOT
    # Login to ACR
    az acr login --name ${data.azurerm_container_registry.main.name}

    # Build and push
    docker build --no-cache -t ${data.azurerm_container_registry.main.login_server}/${var.docker_image_name}:${var.docker_image_tag} .
    docker push ${data.azurerm_container_registry.main.login_server}/${var.docker_image_name}:${var.docker_image_tag}

    # Update container app
    az containerapp update --name ${azurerm_container_app.main.name} --resource-group ${azurerm_resource_group.main.name} --image ${data.azurerm_container_registry.main.login_server}/${var.docker_image_name}:${var.docker_image_tag}

    # View logs
    az containerapp logs show --name ${azurerm_container_app.main.name} --resource-group ${azurerm_resource_group.main.name} --follow
  EOT
}
