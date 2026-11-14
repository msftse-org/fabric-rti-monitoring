mock_provider "azurerm" {
  override_during = plan

  mock_data "azurerm_client_config" {
    defaults = {
      tenant_id = "00000000-0000-0000-0000-000000000002"
    }
  }

  mock_data "azurerm_resource_group" {
    defaults = {
      id       = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-existing"
      location = "westus3"
    }
  }

  mock_resource "azurerm_resource_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti"
    }
  }

  mock_resource "azurerm_dashboard_grafana" {
    defaults = {
      id       = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti/providers/Microsoft.Dashboard/grafana/dev-amg-frti"
      endpoint = "https://grafana.example.test"
    }
  }
}

variables {
  subscription_id                = "00000000-0000-0000-0000-000000000001"
  environment                    = "dev"
  project                        = "frti"
  location                       = "westus3"
  resource_group_name            = "dev-rg-frti"
  create_resource_group          = true
  deploy_fabric_capacity         = false
  fabric_capacity_administrators = []
  fabric_capacity_sku            = "F2"
  deploy_managed_grafana         = false
  grafana_admin_principal_id     = ""
  grafana_admin_principal_type   = "User"
  tags                           = {}
}

run "identity_only" {
  command = plan

  module {
    source = "./modules/foundation"
  }

  assert {
    condition = (
      length(azurerm_resource_group.main) == 1 &&
      length(azurerm_fabric_capacity.main) == 0 &&
      length(azurerm_dashboard_grafana.main) == 0 &&
      length(azurerm_role_assignment.grafana_admin) == 0 &&
      azurerm_user_assigned_identity.collector.resource_group_name == azurerm_resource_group.main[0].name
    )
    error_message = "The default foundation must create only the dedicated group and collector identity."
  }
}

run "reuse_existing_group" {
  command = plan

  module {
    source = "./modules/foundation"
  }

  variables {
    create_resource_group = false
    resource_group_name   = "rg-existing"
  }

  assert {
    condition = (
      length(azurerm_resource_group.main) == 0 &&
      azurerm_user_assigned_identity.collector.resource_group_name == data.azurerm_resource_group.existing[0].name &&
      output.resource_group_id == data.azurerm_resource_group.existing[0].id
    )
    error_message = "Reusing a resource group must not bring its lifecycle under Terraform management."
  }
}

run "enabled_foundation" {
  command = plan

  module {
    source = "./modules/foundation"
  }

  variables {
    deploy_fabric_capacity         = true
    fabric_capacity_administrators = ["capacity-admin@example.com"]
    deploy_managed_grafana         = true
    grafana_admin_principal_id     = "00000000-0000-0000-0000-000000000021"
    grafana_admin_principal_type   = "Group"
  }

  assert {
    condition = (
      azurerm_dashboard_grafana.main[0].identity[0].type == "SystemAssigned" &&
      !azurerm_dashboard_grafana.main[0].api_key_enabled &&
      azurerm_role_assignment.grafana_admin[0].scope == azurerm_dashboard_grafana.main[0].id &&
      azurerm_role_assignment.grafana_admin[0].principal_id == var.grafana_admin_principal_id &&
      azurerm_role_assignment.grafana_admin[0].principal_type == "Group" &&
      endswith(azurerm_role_assignment.grafana_admin[0].role_definition_id, "/22926164-76b3-42b3-bc55-97df8dab3e41")
    )
    error_message = "Grafana must use managed identity, disabled API keys, and an instance-scoped Admin grant of the requested principal type."
  }

  assert {
    condition     = toset(azurerm_fabric_capacity.main[0].administration_members) == toset(var.fabric_capacity_administrators)
    error_message = "A newly enabled capacity must use the explicitly supplied Fabric administrators."
  }
}

run "long_name_inputs" {
  command = plan

  module {
    source = "./modules/foundation"
  }

  variables {
    environment            = "abcdefgh"
    project                = "abcdefghij"
    deploy_managed_grafana = true
  }

  assert {
    condition     = can(regex("^[a-zA-Z][-a-zA-Z0-9]{0,21}[a-zA-Z0-9]$", azurerm_dashboard_grafana.main[0].name))
    error_message = "Generated Grafana names must fit AzureRM's 2-23 character constraint even with the longest allowed environment and project inputs."
  }
}
