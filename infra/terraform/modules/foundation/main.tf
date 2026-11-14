data "azurerm_client_config" "current" {}

data "azurerm_resource_group" "existing" {
  count = var.create_resource_group ? 0 : 1

  name = var.resource_group_name
}

resource "azurerm_resource_group" "main" {
  count = var.create_resource_group ? 1 : 0

  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

resource "azurerm_user_assigned_identity" "collector" {
  name                = "${var.environment}-id-collector-${var.project}"
  resource_group_name = local.resource_group_name
  location            = var.location
  tags                = var.tags
}

resource "azurerm_fabric_capacity" "main" {
  count = var.deploy_fabric_capacity ? 1 : 0

  name                   = coalesce(var.fabric_capacity_name, "${var.environment}fc${var.project}${local.name_suffix}")
  resource_group_name    = local.resource_group_name
  location               = var.location
  administration_members = var.fabric_capacity_administrators
  tags                   = var.tags

  sku {
    name = var.fabric_capacity_sku
    tier = "Fabric"
  }
}

resource "azurerm_dashboard_grafana" "main" {
  count = var.deploy_managed_grafana ? 1 : 0

  # AzureRM limits names to 23 characters; reserve seven for the stable suffix.
  name                                   = coalesce(var.grafana_name, "${substr("${var.environment}-amg-${var.project}", 0, 16)}-${local.name_suffix}")
  resource_group_name                    = local.resource_group_name
  location                               = var.location
  grafana_major_version                  = "12"
  sku                                    = "Standard"
  sku_size                               = "X1"
  api_key_enabled                        = false
  auto_generated_domain_name_label_scope = "TenantReuse"
  deterministic_outbound_ip_enabled      = false
  public_network_access_enabled          = true
  zone_redundancy_enabled                = false
  tags                                   = var.tags

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_role_assignment" "grafana_admin" {
  count = var.deploy_managed_grafana && var.grafana_admin_principal_id != "" ? 1 : 0

  scope              = azurerm_dashboard_grafana.main[0].id
  role_definition_id = "/subscriptions/${var.subscription_id}/providers/Microsoft.Authorization/roleDefinitions/22926164-76b3-42b3-bc55-97df8dab3e41"
  principal_id       = var.grafana_admin_principal_id
  principal_type     = var.grafana_admin_principal_type
}
