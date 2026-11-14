resource "azurerm_eventhub_namespace" "telemetry" {
  name                          = "${var.environment}-ehns-${var.project}-${substr(sha256(lower(var.resource_group_id)), 0, 8)}"
  resource_group_name           = var.resource_group_name
  location                      = var.location
  sku                           = "Standard"
  capacity                      = 1
  auto_inflate_enabled          = false
  local_authentication_enabled  = false
  minimum_tls_version           = "1.2"
  public_network_access_enabled = true
  tags                          = var.tags
}

resource "azurerm_eventhub" "telemetry" {
  name              = var.event_hub_name
  namespace_id      = azurerm_eventhub_namespace.telemetry.id
  partition_count   = 2
  message_retention = 1
  status            = "Active"
}

resource "azurerm_eventhub_consumer_group" "fabric" {
  name                = "fabric"
  resource_group_name = var.resource_group_name
  namespace_name      = azurerm_eventhub_namespace.telemetry.name
  eventhub_name       = azurerm_eventhub.telemetry.name
  user_metadata       = "Dedicated consumer group for the optional Fabric Eventstream."
}

resource "azurerm_role_assignment" "collector_sender" {
  scope              = azurerm_eventhub.telemetry.id
  role_definition_id = "/subscriptions/${var.subscription_id}/providers/Microsoft.Authorization/roleDefinitions/2b629674-e913-4c01-ae53-ef4638d8f975"
  principal_id       = var.collector_principal_id
  principal_type     = "ServicePrincipal"
}

resource "azurerm_role_assignment" "fabric_receiver" {
  scope              = azurerm_eventhub.telemetry.id
  role_definition_id = "/subscriptions/${var.subscription_id}/providers/Microsoft.Authorization/roleDefinitions/a638d3c7-ab3a-418d-83e6-5f17a39d4fde"
  principal_id       = var.fabric_workspace_identity_principal_id
  principal_type     = "ServicePrincipal"
}
