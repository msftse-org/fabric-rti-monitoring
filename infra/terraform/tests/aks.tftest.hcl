mock_provider "azurerm" {
  override_during = plan

  mock_resource "azurerm_kubernetes_cluster" {
    defaults = {
      id              = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti/providers/Microsoft.ContainerService/managedClusters/dev-aks-frti"
      oidc_issuer_url = "https://westus3.oic.prod-aks.azure.com/00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000003/"
    }
  }
}

variables {
  subscription_id       = "00000000-0000-0000-0000-000000000001"
  tenant_id             = "00000000-0000-0000-0000-000000000002"
  environment           = "dev"
  project               = "frti"
  location              = "westus3"
  resource_group_name   = "dev-rg-frti"
  collector_identity_id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti/providers/Microsoft.ManagedIdentity/userAssignedIdentities/dev-id-collector-frti"
  admin_principal_id    = "00000000-0000-0000-0000-000000000021"
  admin_principal_type  = "User"
  authorized_ip_ranges  = []
  kubernetes_version    = null
  node_count            = 1
  node_os_disk_type     = "Ephemeral"
  node_vm_size          = "Standard_D2ds_v5"
  tags                  = {}
}

run "entra_only_workload_identity_cluster" {
  command = plan

  module {
    source = "./modules/aks"
  }

  assert {
    condition = (
      azurerm_kubernetes_cluster.main.oidc_issuer_enabled &&
      azurerm_kubernetes_cluster.main.workload_identity_enabled &&
      azurerm_kubernetes_cluster.main.local_account_disabled &&
      azurerm_kubernetes_cluster.main.azure_active_directory_role_based_access_control[0].azure_rbac_enabled &&
      azurerm_kubernetes_cluster.main.azure_active_directory_role_based_access_control[0].tenant_id == var.tenant_id
    )
    error_message = "The cluster must use Entra ID with Azure RBAC, no local accounts, and an OIDC issuer for workload identity."
  }

  assert {
    condition = (
      azurerm_federated_identity_credential.collector.user_assigned_identity_id == var.collector_identity_id &&
      azurerm_federated_identity_credential.collector.issuer == azurerm_kubernetes_cluster.main.oidc_issuer_url &&
      azurerm_federated_identity_credential.collector.subject == "system:serviceaccount:otel-demo:otel-collector" &&
      azurerm_federated_identity_credential.collector.audience == tolist(["api://AzureADTokenExchange"]) &&
      output.workload_namespace == "otel-demo" &&
      output.collector_service_account == "otel-collector"
    )
    error_message = "Only the chart's collector service account may exchange tokens for the existing collector identity."
  }

  assert {
    condition = (
      azurerm_role_assignment.cluster_admin.scope == azurerm_kubernetes_cluster.main.id &&
      azurerm_role_assignment.cluster_user.scope == azurerm_kubernetes_cluster.main.id &&
      azurerm_role_assignment.cluster_admin.principal_id == var.admin_principal_id &&
      azurerm_role_assignment.cluster_user.principal_id == var.admin_principal_id
    )
    error_message = "Administrator access must be scoped to this cluster only."
  }

  assert {
    condition = (
      azurerm_kubernetes_cluster.main.sku_tier == "Free" &&
      azurerm_kubernetes_cluster.main.default_node_pool[0].node_count == 1 &&
      azurerm_kubernetes_cluster.main.default_node_pool[0].os_disk_type == "Ephemeral" &&
      azurerm_kubernetes_cluster.main.network_profile[0].network_plugin_mode == "overlay" &&
      azurerm_kubernetes_cluster.main.network_profile[0].network_policy == "cilium" &&
      azurerm_kubernetes_cluster.main.node_resource_group == "dev-rg-frti-aks-nodes" &&
      length(azurerm_kubernetes_cluster.main.api_server_access_profile) == 0
    )
    error_message = "Defaults must stay a single-node, free-tier cluster with network policy enforcement."
  }
}

run "authorized_api_server_ranges" {
  command = plan

  module {
    source = "./modules/aks"
  }

  variables {
    authorized_ip_ranges = ["203.0.113.10/32"]
  }

  assert {
    condition     = toset(azurerm_kubernetes_cluster.main.api_server_access_profile[0].authorized_ip_ranges) == toset(["203.0.113.10/32"])
    error_message = "Supplied ranges must restrict the public API server."
  }
}
