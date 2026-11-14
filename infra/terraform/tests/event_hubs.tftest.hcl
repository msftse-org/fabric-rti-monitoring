mock_provider "azurerm" {
  override_during = plan

  mock_resource "azurerm_eventhub_namespace" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti/providers/Microsoft.EventHub/namespaces/dev-ehns-frti"
    }
  }

  mock_resource "azurerm_eventhub" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti/providers/Microsoft.EventHub/namespaces/dev-ehns-frti/eventhubs/otel-telemetry"
    }
  }
}

run "identity_only_broker_access" {
  command = plan

  module {
    source = "./modules/event_hubs"
  }

  variables {
    subscription_id                        = "00000000-0000-0000-0000-000000000001"
    environment                            = "dev"
    project                                = "frti"
    location                               = "westus3"
    resource_group_name                    = "dev-rg-frti"
    resource_group_id                      = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti"
    event_hub_name                         = "otel-telemetry"
    collector_principal_id                 = "00000000-0000-0000-0000-000000000012"
    fabric_workspace_identity_principal_id = "00000000-0000-0000-0000-000000000031"
    tags                                   = {}
  }

  assert {
    condition = (
      !azurerm_eventhub_namespace.telemetry.local_authentication_enabled &&
      azurerm_role_assignment.collector_sender.scope == azurerm_eventhub.telemetry.id &&
      azurerm_role_assignment.fabric_receiver.scope == azurerm_eventhub.telemetry.id &&
      azurerm_role_assignment.collector_sender.principal_id == var.collector_principal_id &&
      azurerm_role_assignment.fabric_receiver.principal_id == var.fabric_workspace_identity_principal_id &&
      endswith(azurerm_role_assignment.collector_sender.role_definition_id, "/2b629674-e913-4c01-ae53-ef4638d8f975") &&
      endswith(azurerm_role_assignment.fabric_receiver.role_definition_id, "/a638d3c7-ab3a-418d-83e6-5f17a39d4fde")
    )
    error_message = "The optional broker must use separate, hub-scoped sender/receiver identities with local authentication disabled."
  }
}
