mock_provider "azurerm" {
  override_during = plan

  mock_resource "azurerm_container_app_environment" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti/providers/Microsoft.App/managedEnvironments/dev-cae-frti"
    }
  }

  mock_resource "azurerm_log_analytics_workspace" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti/providers/Microsoft.OperationalInsights/workspaces/dev-law-frti"
    }
  }

  mock_resource "azurerm_container_app" {
    defaults = {
      ingress = {
        fqdn = "dev-ca-frti.internal.example.azurecontainerapps.io"
      }
    }
  }
}

variables {
  environment                  = "dev"
  project                      = "frti"
  location                     = "westus3"
  resource_group_name          = "dev-rg-frti"
  collector_identity_id        = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti/providers/Microsoft.ManagedIdentity/userAssignedIdentities/dev-id-collector-frti"
  collector_identity_client_id = "00000000-0000-0000-0000-000000000011"
  kusto_cluster_uri            = "https://example.kusto.fabric.microsoft.com"
  kusto_database               = "observability"
  collector_image              = "otel/opentelemetry-collector-contrib:0.141.0"
  collector_config             = file("../../collector/cloud.yaml")
  emitter_image                = "python:3.13-slim"
  emitter_source               = file("../../demo/emit.py")
  tags                         = {}
}

run "internal_managed_identity_runtime" {
  command = plan

  module {
    source = "./modules/collector"
  }

  assert {
    condition = (
      !azurerm_container_app.collector.ingress[0].external_enabled &&
      !azurerm_container_app.collector.ingress[0].allow_insecure_connections &&
      azurerm_container_app.collector.ingress[0].target_port == tonumber(split(":", yamldecode(var.collector_config).receivers.otlp.protocols.http.endpoint)[1]) &&
      toset(azurerm_container_app.collector.identity[0].identity_ids) == toset([var.collector_identity_id])
    )
    error_message = "The collector must attach the ingestion identity and route internal HTTPS to the shared configuration's receiver port."
  }

  assert {
    condition = {
      for entry in azurerm_container_app.collector.template[0].container[0].env : entry.name => entry.value
      } == {
      OTEL_CONFIG       = var.collector_config
      KUSTO_CLUSTER_URI = var.kusto_cluster_uri
      KUSTO_DATABASE    = var.kusto_database
      AZURE_CLIENT_ID   = var.collector_identity_client_id
    }
    error_message = "Load the shared collector file literally and select the managed identity using its client ID."
  }

  assert {
    condition = (
      azurerm_container_app_job.synthetic.template[0].container[0].command == tolist(["python3", "-c", var.emitter_source]) &&
      azurerm_container_app_job.synthetic.template[0].container[0].args == tolist([
        "--endpoint", "https://${azurerm_container_app.collector.ingress[0].fqdn}",
        "--count", "60", "--interval", "1",
      ]) &&
      length(azurerm_container_app_job.synthetic.manual_trigger_config) == 1 &&
      length(azurerm_container_app_job.synthetic.schedule_trigger_config) == 0 &&
      length(azurerm_container_app_job.synthetic.event_trigger_config) == 0 &&
      azurerm_container_app_job.synthetic.replica_retry_limit == 0
    )
    error_message = "The job must use the shared emitter against the stable internal endpoint, run manually, and remain bounded without retries."
  }

  assert {
    condition = (
      azurerm_container_app_environment.main.logs_destination == "azure-monitor" &&
      azurerm_monitor_diagnostic_setting.platform.target_resource_id == azurerm_container_app_environment.main.id &&
      azurerm_monitor_diagnostic_setting.platform.log_analytics_workspace_id == azurerm_log_analytics_workspace.platform.id &&
      !azurerm_log_analytics_workspace.platform.local_authentication_enabled
    )
    error_message = "Platform logs must use Azure Monitor diagnostics without a shared-key Log Analytics connection."
  }
}
