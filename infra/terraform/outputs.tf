output "aks_cluster_name" {
  description = "AKS demo cluster name, or an empty string when disabled."
  value       = var.deploy_aks ? module.aks[0].cluster_name : ""
}

output "aks_helm_values" {
  description = "Non-secret Helm values for k8s/otel-demo. Write to a git-ignored *.local.yaml file; empty when AKS is disabled."
  value = var.deploy_aks ? yamlencode({
    clusterName = module.aks[0].cluster_name
    kusto = {
      clusterUri = var.kusto_cluster_uri
      database   = var.kusto_database
    }
    workloadIdentity = {
      clientId           = module.foundation.collector_identity_client_id
      tenantId           = module.foundation.tenant_id
      namespace          = module.aks[0].workload_namespace
      serviceAccountName = module.aks[0].collector_service_account
    }
  }) : ""
}

output "aks_node_resource_group" {
  description = "AKS-managed node resource group, or an empty string when disabled."
  value       = var.deploy_aks ? module.aks[0].node_resource_group : ""
}

output "collector_app_name" {
  description = "Collector Container App name, or an empty string when disabled."
  value       = var.deploy_collector ? module.collector[0].collector_app_name : ""
}

output "collector_identity_client_id" {
  description = "Collector identity application/client ID for the KQL database ingestor grant."
  value       = module.foundation.collector_identity_client_id
}

output "collector_identity_principal_id" {
  description = "Collector identity object ID for Azure RBAC, not the KQL aadapp client ID."
  value       = module.foundation.collector_identity_principal_id
}

output "collector_internal_endpoint" {
  description = "HTTPS OTLP endpoint reachable only inside the Container Apps environment."
  value       = var.deploy_collector ? module.collector[0].collector_internal_endpoint : ""
}

output "demo_job_name" {
  description = "Manual synthetic telemetry job name, or an empty string when disabled."
  value       = var.deploy_collector ? module.collector[0].demo_job_name : ""
}

output "event_hubs" {
  description = "Optional broker identifiers and endpoints. This does not imply a configured Fabric Eventstream."
  value       = var.deploy_event_hubs ? module.event_hubs[0] : null
}

output "fabric_capacity_arm_id" {
  description = "Optional capacity ARM resource ID. This is NOT the Fabric capacity UUID used by the bootstrap."
  value       = module.foundation.fabric_capacity_arm_id
}

output "fabric_capacity_resource_name" {
  description = "Name of the optional new Fabric capacity."
  value       = module.foundation.fabric_capacity_resource_name
}

output "grafana_endpoint" {
  description = "Managed Grafana HTTPS endpoint, or an empty string when disabled."
  value       = module.foundation.grafana_endpoint
}

output "grafana_principal_id" {
  description = "Grafana system identity object ID for the bootstrap's dedicated-workspace Viewer grant."
  value       = module.foundation.grafana_principal_id
}

output "grafana_resource_name" {
  description = "Managed Grafana resource name, or an empty string when disabled."
  value       = module.foundation.grafana_resource_name
}

output "platform_log_analytics_workspace_id" {
  description = "Platform diagnostics workspace ARM ID, or an empty string when disabled."
  value       = var.deploy_collector ? module.collector[0].platform_log_analytics_workspace_id : ""
}

output "resource_group_id" {
  description = "Resource group ARM ID."
  value       = module.foundation.resource_group_id
}

output "resource_group_name" {
  description = "Resource group containing the Azure demonstration."
  value       = module.foundation.resource_group_name
}

output "tenant_id" {
  description = "Tenant UUID used with the collector client ID in the KQL ingestion grant."
  value       = module.foundation.tenant_id
}
