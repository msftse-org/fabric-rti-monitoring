locals {
  tags = merge({
    Environment = var.environment
    Project     = var.project
    ManagedBy   = "Terraform"
    Purpose     = "Terraform state storage"
  }, var.tags)
}

data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "state" {
  name     = "${var.environment}-tfstate-rg-${var.project}"
  location = var.location
  tags     = local.tags
}

resource "azurerm_storage_account" "state" {
  name                            = "${substr("${var.environment}tfstate${var.project}", 0, 16)}${substr(sha256(lower(azurerm_resource_group.state.id)), 0, 8)}"
  resource_group_name             = azurerm_resource_group.state.name
  location                        = azurerm_resource_group.state.location
  account_tier                    = "Standard"
  account_replication_type        = "GRS"
  account_kind                    = "StorageV2"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  public_network_access           = "Enabled"
  tags                            = local.tags

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = 30
    }

    container_delete_retention_policy {
      days = 30
    }
  }

  network_rules {
    default_action = length(var.allowed_ips) > 0 ? "Deny" : "Allow"
    bypass         = ["AzureServices"]
    ip_rules       = var.allowed_ips
  }
}

resource "azurerm_role_assignment" "state_writer" {
  scope              = azurerm_storage_account.state.id
  role_definition_id = "/subscriptions/${var.subscription_id}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe"
  principal_id       = data.azurerm_client_config.current.object_id
}

resource "azurerm_storage_container" "state" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"

  depends_on = [azurerm_role_assignment.state_writer]
}

resource "azurerm_management_lock" "state" {
  name       = "prevent-deletion"
  scope      = azurerm_storage_account.state.id
  lock_level = "CanNotDelete"
  notes      = "Protects Terraform state storage from accidental control-plane deletion."

  depends_on = [azurerm_storage_container.state]
}
