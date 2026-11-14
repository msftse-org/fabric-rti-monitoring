variable "allowed_ips" {
  type        = list(string)
  description = "Optional public IPv4 addresses or CIDRs permitted to reach state storage. An empty list leaves authenticated public access enabled."
  default     = []
}

variable "environment" {
  type        = string
  description = "Environment prefix used in backend resource names and state keys."
  default     = "dev"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{0,7}$", var.environment))
    error_message = "Use 1-8 lowercase letters or digits, starting with a letter."
  }
}

variable "location" {
  type        = string
  description = "Azure region for the separate state storage resources."
}

variable "project" {
  type        = string
  description = "Short project identifier used in backend resource names."
  default     = "frti"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{0,9}$", var.project))
    error_message = "Use 1-10 lowercase letters or digits, starting with a letter."
  }
}

variable "subscription_id" {
  type        = string
  description = "Azure subscription UUID supplied privately."
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for the separate state storage resources."
  default     = {}
}
