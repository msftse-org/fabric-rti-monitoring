variable "aks_admin_principal_id" {
  type        = string
  description = "Entra object ID receiving AKS RBAC Cluster Admin and Cluster User on the demo cluster. Required with deploy_aks."
  default     = ""

  validation {
    condition = !var.deploy_aks || can(regex(
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
      var.aks_admin_principal_id
    ))
    error_message = "Supply the cluster administrator's Entra object UUID; local Kubernetes accounts are disabled."
  }
}

variable "aks_admin_principal_type" {
  type        = string
  description = "Type of the principal receiving AKS cluster access."
  default     = "User"

  validation {
    condition     = contains(["User", "Group", "ServicePrincipal"], var.aks_admin_principal_type)
    error_message = "AKS administrator principal type must be User, Group, or ServicePrincipal."
  }
}

variable "aks_authorized_ip_ranges" {
  type        = list(string)
  description = "Optional CIDR ranges allowed to reach the AKS API server. Empty keeps a public, Entra-authenticated endpoint."
  default     = []

  validation {
    condition     = alltrue([for range in var.aks_authorized_ip_ranges : can(cidrhost(range, 0))])
    error_message = "Each authorized API server range must be a CIDR, such as 203.0.113.10/32."
  }
}

variable "aks_kubernetes_version" {
  type        = string
  description = "Optional AKS Kubernetes minor version, such as 1.36. Null selects the regional default."
  default     = null
}

variable "aks_node_count" {
  type        = number
  description = "Nodes in the single AKS system pool that also runs the demo workload."
  default     = 1

  validation {
    condition     = var.aks_node_count >= 1 && var.aks_node_count <= 3 && floor(var.aks_node_count) == var.aks_node_count
    error_message = "Use 1 to 3 nodes for the demonstration cluster."
  }
}

variable "aks_node_os_disk_type" {
  type        = string
  description = "AKS node OS disk type. Ephemeral avoids a managed disk but needs a VM size with a temporary or cache disk of at least 64 GiB."
  default     = "Ephemeral"

  validation {
    condition     = contains(["Ephemeral", "Managed"], var.aks_node_os_disk_type)
    error_message = "AKS node OS disk type must be Ephemeral or Managed."
  }
}

variable "aks_node_vm_size" {
  type        = string
  description = "VM size for the AKS system pool. The default has a 75 GiB temporary disk for the ephemeral OS disk."
  default     = "Standard_D2ds_v5"
}

variable "collector_image" {
  type        = string
  description = "Collector image with the reviewed Azure Data Explorer exporter."
  default     = "otel/opentelemetry-collector-contrib:0.141.0"
}

variable "create_resource_group" {
  type        = bool
  description = "Create a dedicated resource group. Set false to use an existing group without managing its lifecycle."
  default     = true
}

variable "deploy_aks" {
  type        = bool
  description = "Opt in to a billable AKS cluster whose Helm-deployed demo apps send continuous telemetry, after Fabric bootstrap and ingestion grants."
  default     = false
}

variable "deploy_collector" {
  type        = bool
  description = "Opt in to the billable collector runtime and manual job after Fabric bootstrap and ingestion grants."
  default     = false
}

variable "deploy_event_hubs" {
  type        = bool
  description = "Opt in to the optional billable broker foundation. Does not change collector routing or create a Fabric Eventstream."
  default     = false
}

variable "deploy_fabric_capacity" {
  type        = bool
  description = "Opt in to a new billable Fabric capacity. Leave false when using an existing capacity or trial."
  default     = false
}

variable "deploy_managed_grafana" {
  type        = bool
  description = "Opt in to a billable Azure Managed Grafana Standard X1 instance."
  default     = false
}

variable "emitter_image" {
  type        = string
  description = "Python runtime for the dependency-free, bounded synthetic telemetry job."
  default     = "python:3.13-slim"
}

variable "environment" {
  type        = string
  description = "Environment prefix used in resource names and tags."
  default     = "dev"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{0,7}$", var.environment))
    error_message = "Use 1-8 lowercase letters or digits, starting with a letter, to fit the resource naming limits."
  }
}

variable "event_hub_name" {
  type        = string
  description = "Event hub name, also used as the Kafka topic, for the optional broker."
  default     = "otel-telemetry"
}

variable "fabric_capacity_administrators" {
  type        = list(string)
  description = "Administrator user UPNs or service principal object IDs accepted by Fabric. Required for a new capacity."
  default     = []

  validation {
    condition = !var.deploy_fabric_capacity || (
      length(var.fabric_capacity_administrators) > 0 &&
      alltrue([for member in var.fabric_capacity_administrators : trimspace(member) != ""])
    )
    error_message = "Supply at least one Fabric capacity administrator when deploy_fabric_capacity is true."
  }
}

variable "fabric_capacity_name" {
  type        = string
  description = "Optional globally unique capacity name. Defaults to an alphanumeric environment/project name with a stable suffix."
  default     = null
}

variable "fabric_capacity_sku" {
  type        = string
  description = "SKU for an optional new Fabric capacity. F2 is a starting point, not a throughput guarantee."
  default     = "F2"

  validation {
    condition     = contains(["F2", "F4", "F8", "F16", "F32", "F64"], var.fabric_capacity_sku)
    error_message = "Choose one of the sample's supported Fabric SKUs: F2, F4, F8, F16, F32, or F64."
  }
}

variable "fabric_workspace_identity_principal_id" {
  type        = string
  description = "Existing Fabric workspace identity object ID for optional Event Hubs receive access, not an application client ID."
  default     = ""

  validation {
    condition = !var.deploy_event_hubs || can(regex(
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
      var.fabric_workspace_identity_principal_id
    ))
    error_message = "Supply the Fabric workspace identity object UUID before enabling the optional broker."
  }
}

variable "grafana_admin_principal_id" {
  type        = string
  description = "Optional Entra object ID receiving Grafana Admin on this instance only."
  default     = ""
}

variable "grafana_admin_principal_type" {
  type        = string
  description = "Type of the principal receiving Grafana Admin."
  default     = "User"

  validation {
    condition     = contains(["User", "Group", "ServicePrincipal"], var.grafana_admin_principal_type)
    error_message = "Grafana Admin principal type must be User, Group, or ServicePrincipal."
  }
}

variable "grafana_name" {
  type        = string
  description = "Optional Managed Grafana name. Defaults to an environment/project name with a stable suffix."
  default     = null
}

variable "kusto_cluster_uri" {
  type        = string
  description = "Fabric database HTTPS QUERY service URI, required when enabling the collector or AKS demo. Do not use the ingest URI."
  default     = ""

  validation {
    condition = !(var.deploy_collector || var.deploy_aks) || (
      can(regex("^https://[a-z0-9][a-z0-9.-]*\\.kusto\\.fabric\\.microsoft\\.com/?$", var.kusto_cluster_uri)) &&
      !startswith(var.kusto_cluster_uri, "https://ingest-")
    )
    error_message = "Enable the collector or AKS demo only after supplying the Fabric HTTPS queryServiceUri, not an ingestion endpoint."
  }
}

variable "kusto_database" {
  type        = string
  description = "Actual databaseName returned by the Fabric bootstrap, including its casing."
  default     = "Observability"

  validation {
    condition     = !(var.deploy_collector || var.deploy_aks) || trimspace(var.kusto_database) != ""
    error_message = "Supply the Fabric database name when enabling the collector or AKS demo."
  }
}

variable "location" {
  type        = string
  description = "Azure region supporting all selected services."
}

variable "project" {
  type        = string
  description = "Short project identifier used in resource names and tags."
  default     = "frti"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{0,9}$", var.project))
    error_message = "Use 1-10 lowercase letters or digits, starting with a letter, to fit the resource naming limits."
  }
}

variable "resource_group_name" {
  type        = string
  description = "Optional new or existing resource group name. Defaults to environment-rg-project."
  default     = null
}

variable "subscription_id" {
  type        = string
  description = "Azure subscription UUID. Supply privately rather than committing account-specific values."
}

variable "tags" {
  type        = map(string)
  description = "Additional tags applied to resources."
  default     = {}
}
