variable "create_resource_group" {
  type        = bool
  description = "Create the resource group rather than look up an existing one."
}

variable "deploy_fabric_capacity" {
  type        = bool
  description = "Create a new billable Fabric capacity."
}

variable "deploy_managed_grafana" {
  type        = bool
  description = "Create a billable Managed Grafana instance."
}

variable "environment" {
  type        = string
  description = "Environment prefix for resource names."
}

variable "fabric_capacity_administrators" {
  type        = list(string)
  description = "Administrator identities accepted by the optional Fabric capacity."
}

variable "fabric_capacity_name" {
  type        = string
  description = "Optional capacity resource name override."
  default     = null
}

variable "fabric_capacity_sku" {
  type        = string
  description = "SKU of the optional Fabric capacity."
}

variable "grafana_admin_principal_id" {
  type        = string
  description = "Optional Entra object ID receiving instance-scoped Grafana Admin."
}

variable "grafana_admin_principal_type" {
  type        = string
  description = "Grafana administrator principal type."
}

variable "grafana_name" {
  type        = string
  description = "Optional Managed Grafana resource name override."
  default     = null
}

variable "location" {
  type        = string
  description = "Azure region for the foundation."
}

variable "project" {
  type        = string
  description = "Project identifier used in resource names."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group to create or reuse."
}

variable "subscription_id" {
  type        = string
  description = "Subscription UUID for scoped built-in role definitions."
}

variable "tags" {
  type        = map(string)
  description = "Common tags for foundation resources."
}
