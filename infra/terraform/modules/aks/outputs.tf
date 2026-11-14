output "cluster_name" {
  description = "AKS cluster name."
  value       = azurerm_kubernetes_cluster.main.name
}

output "collector_service_account" {
  description = "Kubernetes service account trusted by the collector identity's federated credential."
  value       = local.collector_service_account
}

output "node_resource_group" {
  description = "AKS-managed resource group holding the nodes, load balancer, and public IP."
  value       = azurerm_kubernetes_cluster.main.node_resource_group
}

output "oidc_issuer_url" {
  description = "Cluster OIDC issuer trusted by the federated credential."
  value       = azurerm_kubernetes_cluster.main.oidc_issuer_url
}

output "workload_namespace" {
  description = "Kubernetes namespace trusted by the collector identity's federated credential."
  value       = local.workload_namespace
}
