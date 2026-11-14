variable "collector_config" {
  type        = string
  description = "Unmodified contents of the shared collector/cloud.yaml configuration."
}

variable "collector_identity_client_id" {
  type        = string
  description = "Collector managed identity application/client ID."
}

variable "collector_identity_id" {
  type        = string
  description = "Collector user-assigned managed identity ARM ID."
}

variable "collector_image" {
  type        = string
  description = "Reviewed OpenTelemetry Collector Contrib image."
}

variable "emitter_image" {
  type        = string
  description = "Python runtime image for the bounded synthetic job."
}

variable "emitter_source" {
  type        = string
  description = "Unmodified contents of the shared demo/emit.py producer."
}

variable "environment" {
  type        = string
  description = "Environment prefix for resource names."
}

variable "kusto_cluster_uri" {
  type        = string
  description = "Bootstrapped Fabric KQL query service URI."
}

variable "kusto_database" {
  type        = string
  description = "Actual bootstrapped KQL database name."
}

variable "location" {
  type        = string
  description = "Azure region for the runtime."
}

variable "project" {
  type        = string
  description = "Project identifier for resource names."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group containing the runtime."
}

variable "tags" {
  type        = map(string)
  description = "Common tags for runtime resources."
}
