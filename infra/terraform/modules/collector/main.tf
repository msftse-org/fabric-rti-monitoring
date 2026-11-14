resource "azurerm_log_analytics_workspace" "platform" {
  name                            = "${var.environment}-law-${var.project}"
  resource_group_name             = var.resource_group_name
  location                        = var.location
  sku                             = "PerGB2018"
  retention_in_days               = 30
  local_authentication_enabled    = false
  allow_resource_only_permissions = true
  tags                            = var.tags
}

resource "azurerm_container_app_environment" "main" {
  name                = "${var.environment}-cae-${var.project}"
  resource_group_name = var.resource_group_name
  location            = var.location
  logs_destination    = "azure-monitor"
  tags                = var.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

resource "azurerm_monitor_diagnostic_setting" "platform" {
  name                           = "platform-logs"
  target_resource_id             = azurerm_container_app_environment.main.id
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.platform.id
  log_analytics_destination_type = "Dedicated"

  enabled_log {
    category = "ContainerAppConsoleLogs"
  }

  enabled_log {
    category = "ContainerAppSystemLogs"
  }

  # Azure does not return the destination type for this target, which would otherwise show as perpetual drift.
  lifecycle {
    ignore_changes = [log_analytics_destination_type]
  }
}

resource "azurerm_container_app" "collector" {
  name                         = "${var.environment}-ca-${var.project}"
  resource_group_name          = var.resource_group_name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [var.collector_identity_id]
  }

  ingress {
    external_enabled           = false
    allow_insecure_connections = false
    target_port                = 4318
    transport                  = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "collector"
      image  = var.collector_image
      cpu    = 0.5
      memory = "1Gi"
      args   = ["--config=env:OTEL_CONFIG"]

      env {
        name  = "OTEL_CONFIG"
        value = var.collector_config
      }

      env {
        name  = "KUSTO_CLUSTER_URI"
        value = var.kusto_cluster_uri
      }

      env {
        name  = "KUSTO_DATABASE"
        value = var.kusto_database
      }

      env {
        name  = "AZURE_CLIENT_ID"
        value = var.collector_identity_client_id
      }

      startup_probe {
        transport               = "HTTP"
        port                    = 13133
        path                    = "/"
        initial_delay           = 10
        interval_seconds        = 10
        timeout                 = 3
        failure_count_threshold = 6
      }

      readiness_probe {
        transport               = "HTTP"
        port                    = 13133
        path                    = "/"
        initial_delay           = 10
        interval_seconds        = 10
        timeout                 = 3
        failure_count_threshold = 6
        success_count_threshold = 1
      }

      liveness_probe {
        transport               = "HTTP"
        port                    = 13133
        path                    = "/"
        initial_delay           = 10
        interval_seconds        = 10
        timeout                 = 3
        failure_count_threshold = 6
      }
    }
  }
}

resource "azurerm_container_app_job" "synthetic" {
  name                         = "${var.environment}-job-${var.project}"
  resource_group_name          = var.resource_group_name
  location                     = var.location
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 300
  replica_retry_limit          = 0
  tags                         = var.tags

  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  template {
    container {
      name    = "synthetic-telemetry"
      image   = var.emitter_image
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["python3", "-c", var.emitter_source]
      args = [
        "--endpoint", "https://${azurerm_container_app.collector.ingress[0].fqdn}",
        "--count", "60",
        "--interval", "1",
      ]
    }
  }
}
