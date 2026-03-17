variable "project_name" {
  description = "Name of the project, used as prefix for all resources"
  type        = string
  default     = "discord-wsj27-bot"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "swedencentral"
}

variable "location-abbr" {
  description = "Azure region abbreviation"
  type        = string
  default     = "sec"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

variable "docker_image_name" {
  description = "Docker image name in ACR"
  type        = string
  default     = "discord-wsj27-bot"
}

variable "docker_image_tag" {
  description = "Docker image tag"
  type        = string
  default     = "latest"
}

# Discord secrets
variable "discord_token" {
  description = "Discord bot token"
  type        = string
  sensitive   = true
}

variable "discord_client_id" {
  description = "Discord client ID"
  type        = string
  sensitive   = true
}

variable "discord_guild_id" {
  description = "Discord guild ID"
  type        = string
  sensitive   = true
}
