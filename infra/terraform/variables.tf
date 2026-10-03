variable "project" {
  type    = string
  default = "crm-ai"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "web_domain" {
  type = string
}

variable "api_domain" {
  type = string
}

variable "cloudflare_zone_id" {
  type = string
}

variable "api_image" {
  type = string
}

variable "web_image" {
  type = string
}

variable "worker_image" {
  type = string
}

variable "migration_image" {
  type = string
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "web_desired_count" {
  type    = number
  default = 2
}

variable "worker_desired_count" {
  type    = number
  default = 2
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 100
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "meta_transport_mode" {
  type    = string
  default = "disabled"
  validation {
    condition     = contains(["disabled", "live"], var.meta_transport_mode)
    error_message = "Production Meta transport may be disabled or live, never mock."
  }
}

variable "ai_transport_mode" {
  type    = string
  default = "disabled"
  validation {
    condition     = contains(["disabled", "live"], var.ai_transport_mode)
    error_message = "Production AI transport may be disabled or live, never mock."
  }
}

variable "openai_api_key_secret_arn" {
  type      = string
  default   = null
  nullable  = true
  sensitive = true
}

variable "meta_runtime_secret_arn" {
  type      = string
  default   = null
  nullable  = true
  sensitive = true
}
