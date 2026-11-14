locals {
  # The Helm chart refuses to install unless its release namespace and service
  # account match this federated subject.
  workload_namespace        = "otel-demo"
  collector_service_account = "otel-collector"
}

resource "azurerm_kubernetes_cluster" "main" {
  name                = "${var.environment}-aks-${var.project}"
  resource_group_name = var.resource_group_name
  location            = var.location
  dns_prefix          = "${var.environment}-aks-${var.project}"
  node_resource_group = "${var.resource_group_name}-aks-nodes"
  kubernetes_version  = var.kubernetes_version
  # Free control plane for a demo; use Standard for an uptime SLA.
  sku_tier                          = "Free"
  automatic_upgrade_channel         = "patch"
  node_os_upgrade_channel           = "NodeImage"
  oidc_issuer_enabled               = true
  workload_identity_enabled         = true
  local_account_disabled            = true
  role_based_access_control_enabled = true
  tags                              = var.tags

  default_node_pool {
    name                        = "system"
    vm_size                     = var.node_vm_size
    node_count                  = var.node_count
    os_sku                      = "AzureLinux"
    os_disk_type                = var.node_os_disk_type
    os_disk_size_gb             = 64
    temporary_name_for_rotation = "systemtmp"
    tags                        = var.tags

    upgrade_settings {
      max_surge = "10%"
    }
  }

  identity {
    type = "SystemAssigned"
  }

  # One fixed node pool; node auto-provisioning stays off.
  node_provisioning_profile {
    mode = "Manual"
  }

  azure_active_directory_role_based_access_control {
    azure_rbac_enabled = true
    tenant_id          = var.tenant_id
  }

  network_profile {
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    network_data_plane  = "cilium"
    network_policy      = "cilium"
    load_balancer_sku   = "standard"
    outbound_type       = "loadBalancer"
  }

  dynamic "api_server_access_profile" {
    for_each = length(var.authorized_ip_ranges) > 0 ? [var.authorized_ip_ranges] : []

    content {
      authorized_ip_ranges = api_server_access_profile.value
    }
  }
}

# Kubernetes data-plane access through Entra ID; local accounts are disabled.
resource "azurerm_role_assignment" "cluster_admin" {
  scope              = azurerm_kubernetes_cluster.main.id
  role_definition_id = "/subscriptions/${var.subscription_id}/providers/Microsoft.Authorization/roleDefinitions/b1ff04bb-8a4e-4dc4-8eb5-8693973ce19b"
  principal_id       = var.admin_principal_id
  principal_type     = var.admin_principal_type
}

# Lets the administrator download the Entra-only kubeconfig without Owner rights.
resource "azurerm_role_assignment" "cluster_user" {
  scope              = azurerm_kubernetes_cluster.main.id
  role_definition_id = "/subscriptions/${var.subscription_id}/providers/Microsoft.Authorization/roleDefinitions/4abbcc35-e782-43d8-92c5-2d3f1bd2253f"
  principal_id       = var.admin_principal_id
  principal_type     = var.admin_principal_type
}

# Reuses the collector identity and its existing KQL ingestor grant.
resource "azurerm_federated_identity_credential" "collector" {
  name                      = "${var.environment}-aks-${var.project}-collector"
  user_assigned_identity_id = var.collector_identity_id
  issuer                    = azurerm_kubernetes_cluster.main.oidc_issuer_url
  subject                   = "system:serviceaccount:${local.workload_namespace}:${local.collector_service_account}"
  audience                  = ["api://AzureADTokenExchange"]
}
