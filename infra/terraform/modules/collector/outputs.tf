output "collector_app_name" {
  description = "Collector Container App resource name."
  value       = azurerm_container_app.collector.name
}

output "collector_internal_endpoint" {
  description = "Stable environment-internal HTTPS OTLP endpoint."
  value       = "https://${azurerm_container_app.collector.ingress[0].fqdn}"
}

output "demo_job_name" {
  description = "Manual synthetic telemetry job name."
  value       = azurerm_container_app_job.synthetic.name
}

output "platform_log_analytics_workspace_id" {
  description = "ARM ID of the platform diagnostics workspace."
  value       = azurerm_log_analytics_workspace.platform.id
}
