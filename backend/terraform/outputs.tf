output "rds_endpoint" {
  value       = aws_db_instance.postgres.endpoint
  description = "The connection endpoint of the provisioned PostGIS PostgreSQL database instance."
}

output "alb_dns_name" {
  value       = aws_lb.main.dns_name
  description = "The public DNS name of the Application Load Balancer to access the FilingPulse FastAPI server."
}
