mock_provider "azurerm" {
  override_during = plan

  mock_data "azurerm_client_config" {
    defaults = {
      tenant_id = "00000000-0000-0000-0000-000000000002"
    }
  }

  mock_resource "azurerm_resource_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti"
    }
  }

  mock_resource "azurerm_user_assigned_identity" {
    defaults = {
      id           = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti/providers/Microsoft.ManagedIdentity/userAssignedIdentities/dev-id-collector-frti"
      client_id    = "00000000-0000-0000-0000-000000000011"
      principal_id = "00000000-0000-0000-0000-000000000012"
    }
  }

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

  mock_resource "azurerm_kubernetes_cluster" {
    defaults = {
      id              = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/dev-rg-frti/providers/Microsoft.ContainerService/managedClusters/dev-aks-frti"
      oidc_issuer_url = "https://westus3.oic.prod-aks.azure.com/00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000003/"
    }
  }
}

variables {
  subscription_id = "00000000-0000-0000-0000-000000000001"
  location        = "westus3"
}

run "safe_defaults" {
  command = plan

  assert {
    condition = (
      length(module.collector) == 0 &&
      length(module.event_hubs) == 0 &&
      length(module.aks) == 0 &&
      output.aks_helm_values == "" &&
      output.grafana_endpoint == "" &&
      output.fabric_capacity_arm_id == "" &&
      output.demo_job_name == ""
    )
    error_message = "A fresh default plan must not enable any billable demonstration service."
  }
}

run "runtime_after_bootstrap" {
  command = plan

  variables {
    deploy_collector  = true
    kusto_cluster_uri = "https://example.kusto.fabric.microsoft.com"
    kusto_database    = "observability"
  }

  assert {
    condition = (
      output.collector_internal_endpoint == "https://dev-ca-frti.internal.example.azurecontainerapps.io" &&
      output.demo_job_name == "dev-job-frti" &&
      output.collector_identity_client_id != output.collector_identity_principal_id &&
      output.grafana_endpoint == "" &&
      output.fabric_capacity_arm_id == ""
    )
    error_message = "The runtime must work independently of new Grafana/capacity resources and expose distinct identity identifiers."
  }
}

run "collector_requires_query_uri" {
  command = plan

  variables {
    deploy_collector = true
  }

  expect_failures = [var.kusto_cluster_uri]
}

run "collector_rejects_ingestion_uri" {
  command = plan

  variables {
    deploy_collector  = true
    kusto_cluster_uri = "https://ingest-example.kusto.fabric.microsoft.com"
  }

  expect_failures = [var.kusto_cluster_uri]
}

run "collector_requires_database" {
  command = plan

  variables {
    deploy_collector  = true
    kusto_cluster_uri = "https://example.kusto.fabric.microsoft.com"
    kusto_database    = " "
  }

  expect_failures = [var.kusto_database]
}

run "capacity_requires_administrator" {
  command = plan

  variables {
    deploy_fabric_capacity = true
  }

  expect_failures = [var.fabric_capacity_administrators]
}

run "broker_requires_workspace_identity" {
  command = plan

  variables {
    deploy_event_hubs = true
  }

  expect_failures = [var.fabric_workspace_identity_principal_id]
}

run "aks_demo_after_bootstrap" {
  command = plan

  variables {
    deploy_aks             = true
    aks_admin_principal_id = "00000000-0000-0000-0000-000000000021"
    kusto_cluster_uri      = "https://example.kusto.fabric.microsoft.com"
    kusto_database         = "observability"
  }

  assert {
    condition = yamldecode(output.aks_helm_values) == {
      clusterName = "dev-aks-frti"
      kusto = {
        clusterUri = "https://example.kusto.fabric.microsoft.com"
        database   = "observability"
      }
      workloadIdentity = {
        clientId           = "00000000-0000-0000-0000-000000000011"
        tenantId           = "00000000-0000-0000-0000-000000000002"
        namespace          = "otel-demo"
        serviceAccountName = "otel-collector"
      }
    }
    error_message = "Helm values must carry the collector client ID, query URI, and the federated namespace and service account."
  }

  assert {
    condition = (
      length(module.collector) == 0 &&
      output.aks_cluster_name == "dev-aks-frti" &&
      output.aks_node_resource_group == "dev-rg-frti-aks-nodes"
    )
    error_message = "The AKS demo must not require the Container Apps runtime."
  }
}

run "aks_requires_administrator" {
  command = plan

  variables {
    deploy_aks        = true
    kusto_cluster_uri = "https://example.kusto.fabric.microsoft.com"
    kusto_database    = "observability"
  }

  expect_failures = [var.aks_admin_principal_id]
}

run "aks_requires_query_uri" {
  command = plan

  variables {
    deploy_aks             = true
    aks_admin_principal_id = "00000000-0000-0000-0000-000000000021"
  }

  expect_failures = [var.kusto_cluster_uri]
}

run "aks_rejects_invalid_api_server_range" {
  command = plan

  variables {
    aks_authorized_ip_ranges = ["203.0.113.10"]
  }

  expect_failures = [var.aks_authorized_ip_ranges]
}
