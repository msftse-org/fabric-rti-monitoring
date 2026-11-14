locals {
  resource_group_name = coalesce(var.resource_group_name, "${var.environment}-rg-${var.project}")
  tags = merge({
    Environment = var.environment
    Project     = var.project
    ManagedBy   = "Terraform"
    Purpose     = "Observability demo"
  }, var.tags)
}

module "foundation" {
  source = "./modules/foundation"

  subscription_id                = var.subscription_id
  environment                    = var.environment
  project                        = var.project
  location                       = var.location
  tags                           = local.tags
  create_resource_group          = var.create_resource_group
  resource_group_name            = local.resource_group_name
  deploy_fabric_capacity         = var.deploy_fabric_capacity
  fabric_capacity_name           = var.fabric_capacity_name
  fabric_capacity_sku            = var.fabric_capacity_sku
  fabric_capacity_administrators = var.fabric_capacity_administrators
  deploy_managed_grafana         = var.deploy_managed_grafana
  grafana_name                   = var.grafana_name
  grafana_admin_principal_id     = var.grafana_admin_principal_id
  grafana_admin_principal_type   = var.grafana_admin_principal_type
}

module "collector" {
  count = var.deploy_collector ? 1 : 0

  source = "./modules/collector"

  environment                  = var.environment
  project                      = var.project
  location                     = var.location
  tags                         = local.tags
  resource_group_name          = module.foundation.resource_group_name
  collector_identity_id        = module.foundation.collector_identity_id
  collector_identity_client_id = module.foundation.collector_identity_client_id
  kusto_cluster_uri            = var.kusto_cluster_uri
  kusto_database               = var.kusto_database
  collector_image              = var.collector_image
  collector_config             = file("${path.module}/../../collector/cloud.yaml")
  emitter_image                = var.emitter_image
  emitter_source               = file("${path.module}/../../demo/emit.py")
}

module "aks" {
  count = var.deploy_aks ? 1 : 0

  source = "./modules/aks"

  subscription_id       = var.subscription_id
  tenant_id             = module.foundation.tenant_id
  environment           = var.environment
  project               = var.project
  location              = var.location
  tags                  = local.tags
  resource_group_name   = module.foundation.resource_group_name
  collector_identity_id = module.foundation.collector_identity_id
  admin_principal_id    = var.aks_admin_principal_id
  admin_principal_type  = var.aks_admin_principal_type
  authorized_ip_ranges  = var.aks_authorized_ip_ranges
  kubernetes_version    = var.aks_kubernetes_version
  node_count            = var.aks_node_count
  node_os_disk_type     = var.aks_node_os_disk_type
  node_vm_size          = var.aks_node_vm_size
}

module "event_hubs" {
  count = var.deploy_event_hubs ? 1 : 0

  source = "./modules/event_hubs"

  subscription_id                        = var.subscription_id
  environment                            = var.environment
  project                                = var.project
  location                               = var.location
  tags                                   = local.tags
  resource_group_name                    = module.foundation.resource_group_name
  resource_group_id                      = module.foundation.resource_group_id
  event_hub_name                         = var.event_hub_name
  collector_principal_id                 = module.foundation.collector_identity_principal_id
  fabric_workspace_identity_principal_id = var.fabric_workspace_identity_principal_id
}
