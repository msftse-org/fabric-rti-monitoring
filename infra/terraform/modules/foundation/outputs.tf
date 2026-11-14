output "collector_identity_client_id" {
  description = "Collector application/client ID for KQL ingestion grants."
  value       = azurerm_user_assigned_identity.collector.client_id
}

output "collector_identity_id" {
  description = "Collector identity ARM ID for attachment to the Container App."
  value       = azurerm_user_assigned_identity.collector.id
}

output "collector_identity_principal_id" {
  description = "Collector identity object ID for Azure RBAC."
  value       = azurerm_user_assigned_identity.collector.principal_id
}

output "fabric_capacity_arm_id" {
  description = "Optional capacity ARM ID, not its Fabric capacity UUID."
  value       = var.deploy_fabric_capacity ? azurerm_fabric_capacity.main[0].id : ""
}

output "fabric_capacity_resource_name" {
  description = "Optional new capacity resource name."
  value       = var.deploy_fabric_capacity ? azurerm_fabric_capacity.main[0].name : ""
}

output "grafana_endpoint" {
  description = "Managed Grafana HTTPS endpoint."
  value       = var.deploy_managed_grafana ? azurerm_dashboard_grafana.main[0].endpoint : ""
}

output "grafana_principal_id" {
  description = "Grafana system identity object ID for the Fabric Viewer grant."
  value       = var.deploy_managed_grafana ? azurerm_dashboard_grafana.main[0].identity[0].principal_id : ""
}

output "grafana_resource_name" {
  description = "Managed Grafana resource name."
  value       = var.deploy_managed_grafana ? azurerm_dashboard_grafana.main[0].name : ""
}

output "resource_group_id" {
  description = "Managed or existing resource group ARM ID."
  value       = local.resource_group_id
}

output "resource_group_name" {
  description = "Managed or existing resource group name."
  value       = local.resource_group_name
}

output "tenant_id" {
  description = "Tenant UUID for the KQL aadapp grant."
  value       = data.azurerm_client_config.current.tenant_id
}
