mock_provider "azurerm" {
  override_during = plan

  mock_data "azurerm_client_config" {
    defaults = {
      object_id = "00000000-0000-0000-0000-000000000003"
    }
  }

  mock_resource "azurerm_resource_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-tfstate-rg-frti"
    }
  }

  mock_resource "azurerm_storage_account" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-tfstate-rg-frti/providers/Microsoft.Storage/storageAccounts/devtfstatefrti"
    }
  }
}

variables {
  subscription_id = "00000000-0000-0000-0000-000000000001"
  location        = "westus3"
}

run "protected_entra_state_storage" {
  command = plan

  assert {
    condition = (
      !azurerm_storage_account.state.shared_access_key_enabled &&
      !azurerm_storage_account.state.allow_nested_items_to_be_public &&
      azurerm_storage_account.state.default_to_oauth_authentication &&
      azurerm_storage_account.state.https_traffic_only_enabled &&
      azurerm_storage_account.state.public_network_access == "Enabled" &&
      azurerm_storage_container.state.container_access_type == "private" &&
      azurerm_storage_container.state.storage_account_id == azurerm_storage_account.state.id &&
      azurerm_role_assignment.state_writer.scope == azurerm_storage_account.state.id &&
      azurerm_role_assignment.state_writer.principal_id == data.azurerm_client_config.current.object_id
    )
    error_message = "State storage must use private blobs, HTTPS, and scoped Entra data access rather than shared keys."
  }

  assert {
    condition = (
      azurerm_storage_account.state.blob_properties[0].versioning_enabled &&
      azurerm_storage_account.state.blob_properties[0].delete_retention_policy[0].days == 30 &&
      azurerm_storage_account.state.blob_properties[0].container_delete_retention_policy[0].days == 30 &&
      azurerm_management_lock.state.scope == azurerm_storage_account.state.id &&
      azurerm_management_lock.state.lock_level == "CanNotDelete" &&
      strcontains(output.backend_config, "fabric-rti-monitoring/dev/infrastructure.tfstate")
    )
    error_message = "State storage needs recovery protection, a deletion lock, and a distinct application state key."
  }
}

run "restrict_state_network_when_configured" {
  command = plan

  variables {
    allowed_ips = ["203.0.113.10"]
  }

  assert {
    condition = (
      azurerm_storage_account.state.network_rules[0].default_action == "Deny" &&
      toset(azurerm_storage_account.state.network_rules[0].ip_rules) == toset(var.allowed_ips)
    )
    error_message = "An explicit IP allowlist must restrict the state storage network rather than leave the default action at Allow."
  }
}
