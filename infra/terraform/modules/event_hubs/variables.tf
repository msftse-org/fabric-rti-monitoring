variable "collector_principal_id" {
  type        = string
  description = "Collector managed identity object ID for send access, not its application/client ID."
}

variable "environment" {
  type        = string
  description = "Environment prefix for resource names."
}

variable "event_hub_name" {
  type        = string
  description = "Event hub name, also used as the Kafka topic."
}

variable "fabric_workspace_identity_principal_id" {
  type        = string
  description = "Existing Fabric workspace identity object ID for receive access."
}

variable "location" {
  type        = string
  description = "Azure region for the broker."
}

variable "project" {
  type        = string
  description = "Project identifier used in resource names."
}

variable "resource_group_id" {
  type        = string
  description = "Resource group ARM ID used for a stable namespace name suffix."
}

variable "resource_group_name" {
  type        = string
  description = "Resource group containing the optional broker."
}

variable "subscription_id" {
  type        = string
  description = "Subscription UUID for scoped built-in role definitions."
}

variable "tags" {
  type        = map(string)
  description = "Common tags for broker resources."
}
