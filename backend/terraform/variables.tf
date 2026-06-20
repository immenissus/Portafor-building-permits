variable "aws_region" {
  type        = string
  description = "Target AWS Region for provisioning infrastructure."
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Target stage environment name."
  default     = "production"
}

variable "app_name" {
  type        = string
  description = "Application identifier name."
  default     = "filingpulse"
}

variable "db_username" {
  type        = string
  description = "Master administrative username for RDS PostgreSQL."
  default     = "postgres"
}

variable "db_password" {
  type        = string
  description = "Master password for RDS PostgreSQL."
  sensitive   = true
}

variable "admin_api_key" {
  type        = string
  description = "Admin header key required to invoke /jurisdictions POST."
  sensitive   = true
}

variable "secret_key" {
  type        = string
  description = "Cryptographic signing secret key for FastAPI."
  sensitive   = true
}
