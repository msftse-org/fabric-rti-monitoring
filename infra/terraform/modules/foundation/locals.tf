locals {
  resource_group_id   = var.create_resource_group ? azurerm_resource_group.main[0].id : data.azurerm_resource_group.existing[0].id
  resource_group_name = var.create_resource_group ? azurerm_resource_group.main[0].name : data.azurerm_resource_group.existing[0].name
  name_suffix         = substr(sha256(lower(local.resource_group_id)), 0, 6)
}
