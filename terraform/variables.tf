variable "project_name" {
  description = "Name of the project, used as prefix for all resources"
  type        = string
  default     = "discord-wsj27-bot"
}

variable "environment" {
  description = "Deployment environment (e.g., prod, staging)"
  type        = string
  default     = "prod"
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "swedencentral"
}

variable "location-abbr" {
  description = "Azure region abbreviation for resources"
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

# The bot's own configuration and secrets are no longer Terraform's concern.
# They moved to Kubernetes when it left Container Apps: CLAIMS_PATH and NODE_ENV
# to k8s/configmap.yaml, and DISCORD_TOKEN / DISCORD_CLIENT_ID /
# DISCORD_GUILD_ID to the `discord-wsj27-bot-secrets` Secret in the wsj27
# namespace.
#
# docker_image_name and docker_image_tag go with them. The tag was pinned to
# "latest", which on Container Apps meant a deploy could silently keep running
# the old image; CI now tags with the commit SHA.
