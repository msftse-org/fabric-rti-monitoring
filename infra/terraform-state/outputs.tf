output "backend_config" {
  description = "Private backend configuration for the application root, using a distinct repository/environment state key."
  value       = <<-CONFIG
    resource_group_name  = "${azurerm_resource_group.state.name}"
    storage_account_name = "${azurerm_storage_account.state.name}"
    container_name       = "${azurerm_storage_container.state.name}"
    key                  = "fabric-rti-monitoring/${var.environment}/infrastructure.tfstate"
    subscription_id      = "${var.subscription_id}"
    use_azuread_auth     = true
  CONFIG
}

output "resource_group_name" {
  description = "Resource group containing the separate state storage."
  value       = azurerm_resource_group.state.name
}

output "storage_account_id" {
  description = "State storage ARM ID for scoped access management."
  value       = azurerm_storage_account.state.id
}

output "storage_account_name" {
  description = "Entra-authenticated state storage account name."
  value       = azurerm_storage_account.state.name
}
