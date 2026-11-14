variable "admin_principal_id" {
  type        = string
  description = "Entra object ID receiving AKS RBAC Cluster Admin and Cluster User on this cluster only."
}

variable "admin_principal_type" {
  type        = string
  description = "Type of the cluster administrator principal."
}

variable "authorized_ip_ranges" {
  type        = list(string)
  description = "Optional CIDR ranges allowed to reach the public API server."
}

variable "collector_identity_id" {
  type        = string
  description = "Collector user-assigned managed identity ARM ID that receives the federated credential."
}

variable "environment" {
  type        = string
  description = "Environment prefix for resource names."
}

variable "kubernetes_version" {
  type        = string
  description = "Optional Kubernetes minor version. Null selects the regional AKS default."
}

variable "location" {
  type        = string
  description = "Azure region for the cluster."
}

variable "node_count" {
  type        = number
  description = "Number of nodes in the single system node pool."
}

variable "node_os_disk_type" {
  type        = string
  description = "Node OS disk type. Ephemeral requires a VM size with a large enough cache or temporary disk."
}

variable "node_vm_size" {
  type        = string
  description = "VM size for the single system node pool."
}

variable "project" {
  type        = string
  description = "Project identifier for resource names."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group containing the cluster."
}

variable "subscription_id" {
  type        = string
  description = "Subscription UUID used to build built-in role definition IDs."
}

variable "tags" {
  type        = map(string)
  description = "Common tags for the cluster and its node pool."
}

variable "tenant_id" {
  type        = string
  description = "Entra tenant UUID for cluster authentication."
}
