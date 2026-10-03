resource "aws_kms_key" "main" {
  description             = "${local.name} application data"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.main.key_id
}

resource "random_password" "db" {
  length  = 40
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name}-rds-monitoring"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

resource "aws_db_instance" "main" {
  identifier                     = local.name
  engine                         = "postgres"
  instance_class                 = var.db_instance_class
  allocated_storage              = var.db_allocated_storage_gb
  max_allocated_storage          = var.db_allocated_storage_gb * 5
  storage_type                   = "gp3"
  storage_encrypted              = true
  kms_key_id                     = aws_kms_key.main.arn
  db_name                        = "crm_ai"
  username                       = "crm_ai"
  password                       = random_password.db.result
  port                           = 5432
  db_subnet_group_name           = aws_db_subnet_group.main.name
  vpc_security_group_ids         = [aws_security_group.database.id]
  multi_az                       = true
  publicly_accessible            = false
  backup_retention_period        = 35
  copy_tags_to_snapshot          = true
  deletion_protection            = true
  skip_final_snapshot            = false
  final_snapshot_identifier      = "${local.name}-final"
  auto_minor_version_upgrade     = true
  performance_insights_enabled   = true
  performance_insights_kms_key_id = aws_kms_key.main.arn
  monitoring_interval            = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
}

resource "aws_secretsmanager_secret" "database_url" {
  name       = "${local.name}/database-url"
  kms_key_id = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://crm_ai:${urlencode(random_password.db.result)}@${aws_db_instance.main.address}:5432/crm_ai"
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "random_password" "platform_encryption" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt" {
  name       = "${local.name}/jwt-access-secret"
  kms_key_id = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = random_password.jwt.result
}

resource "aws_secretsmanager_secret" "platform_encryption" {
  name       = "${local.name}/platform-encryption-key"
  kms_key_id = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret_version" "platform_encryption" {
  secret_id     = aws_secretsmanager_secret.platform_encryption.id
  secret_string = random_password.platform_encryption.result
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = local.name
  description                = "${local.name} Redis"
  engine                     = "redis"
  node_type                  = var.redis_node_type
  port                       = 6379
  parameter_group_name       = "default.redis7"
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  kms_key_id                 = aws_kms_key.main.arn
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  snapshot_retention_limit   = 7
}

resource "aws_s3_bucket" "objects" {
  bucket_prefix = "${local.name}-objects-"
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "objects" {
  bucket = aws_s3_bucket.objects.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "objects" {
  bucket = aws_s3_bucket.objects.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "objects" {
  bucket                  = aws_s3_bucket.objects.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_sqs_queue" "dead_letter" {
  name                      = "${local.name}-events-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.main.arn
}

resource "aws_sqs_queue" "events" {
  name                       = "${local.name}-events"
  visibility_timeout_seconds = 120
  message_retention_seconds  = 345600
  kms_master_key_id          = aws_kms_key.main.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dead_letter.arn
    maxReceiveCount     = 5
  })
}
