resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_service_discovery_private_dns_namespace" "main" {
  name = "${local.name}.internal"
  vpc  = aws_vpc.main.id
}

resource "aws_service_discovery_service" "api" {
  name = "api"
  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }
  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue", "kms:Decrypt"]
      Resource = concat(
        [
          aws_secretsmanager_secret.database_url.arn,
          aws_secretsmanager_secret.jwt.arn,
          aws_secretsmanager_secret.platform_encryption.arn,
          aws_kms_key.main.arn
        ],
        (var.openai_api_key_secret_arn == null || var.openai_api_key_secret_arn == "") ? [] : [var.openai_api_key_secret_arn],
        (var.meta_runtime_secret_arn == null || var.meta_runtime_secret_arn == "") ? [] : [var.meta_runtime_secret_arn],
        (var.payment_runtime_secret_arn == null || var.payment_runtime_secret_arn == "") ? [] : [var.payment_runtime_secret_arn]
      )
    }]
  })
}

resource "aws_iam_role" "task" {
  name = "${local.name}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "task" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.objects.arn}/*"
      },
      {
        Effect = "Allow"
        Action = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = [aws_sqs_queue.events.arn, aws_sqs_queue.dead_letter.arn]
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${local.name}/web"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name}/worker"
  retention_in_days = 30
}

resource "aws_lb" "main" {
  name               = substr(local.name, 0, 32)
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "web" {
  name        = substr("${local.name}-web", 0, 32)
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    path                = "/"
    matcher             = "200-399"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }
}

resource "aws_lb_target_group" "api" {
  name        = substr("${local.name}-api", 0, 32)
  port        = 4000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    path                = "/v1/health/ready"
    matcher             = "200"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
  }
}

locals {
  common_api_environment = concat(
    [
      { name = "NODE_ENV", value = "production" },
      { name = "API_PORT", value = "4000" },
      { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379" },
      { name = "EVENT_STREAM", value = "crm-ai:events" },
      { name = "CORS_ORIGINS", value = "https://${var.web_domain}" },
      { name = "PUBLIC_API_ORIGIN", value = "https://${var.api_domain}" },
      { name = "WEB_APP_ORIGIN", value = "https://${var.web_domain}" },
      { name = "META_TRANSPORT_MODE", value = var.meta_transport_mode },
      { name = "AI_TRANSPORT_MODE", value = var.ai_transport_mode },
      { name = "SAAS_PAYMENT_MODE", value = var.saas_payment_mode },
      { name = "SAAS_PAYMENT_PROVIDER", value = var.saas_payment_provider },
      { name = "SAAS_PAYMENT_ALLOWED_CURRENCIES", value = var.saas_payment_allowed_currencies },
      { name = "TRUST_PROXY_HOPS", value = tostring(var.trust_proxy_hops) },
      { name = "RATE_LIMIT_ENABLED", value = tostring(var.rate_limit_enabled) },
      { name = "RATE_LIMIT_PUBLIC_PER_MINUTE", value = tostring(var.rate_limit_public_per_minute) },
      { name = "RATE_LIMIT_AUTH_PER_MINUTE", value = tostring(var.rate_limit_auth_per_minute) },
      { name = "RATE_LIMIT_SESSION_PER_MINUTE", value = tostring(var.rate_limit_session_per_minute) },
      { name = "RATE_LIMIT_EXTERNAL_PER_MINUTE", value = tostring(var.rate_limit_external_per_minute) },
      { name = "RATE_LIMIT_WEBHOOK_PER_MINUTE", value = tostring(var.rate_limit_webhook_per_minute) },
      { name = "AI_WHATSAPP_EVENT_CONSUMER_ENABLED", value = "false" },
      { name = "AUTOMATION_EVENT_CONSUMER_ENABLED", value = "false" },
      { name = "AUTOMATION_SCHEDULER_ENABLED", value = "false" }
    ],
    var.meta_transport_mode == "live" ? [
      { name = "META_GRAPH_VERSION", value = var.meta_graph_version },
      { name = "META_APP_ID", value = var.meta_app_id },
      { name = "META_EMBEDDED_SIGNUP_CONFIG_ID", value = var.meta_embedded_signup_config_id },
      { name = "META_PROVIDER_BUSINESS_ID", value = var.meta_provider_business_id },
      { name = "META_SYSTEM_USER_ID", value = var.meta_system_user_id }
    ] : []
  )

  core_secrets = [
    { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
    { name = "JWT_ACCESS_SECRET", valueFrom = aws_secretsmanager_secret.jwt.arn },
    { name = "PLATFORM_SECRET_ENCRYPTION_KEY", valueFrom = aws_secretsmanager_secret.platform_encryption.arn }
  ]

  external_secrets = concat(
    (var.openai_api_key_secret_arn == null || var.openai_api_key_secret_arn == "") ? [] : [
      { name = "OPENAI_API_KEY", valueFrom = var.openai_api_key_secret_arn }
    ],
    (var.meta_runtime_secret_arn == null || var.meta_runtime_secret_arn == "") ? [] : [
      { name = "META_APP_SECRET", valueFrom = "${var.meta_runtime_secret_arn}:META_APP_SECRET::" },
      { name = "META_SYSTEM_USER_ACCESS_TOKEN", valueFrom = "${var.meta_runtime_secret_arn}:META_SYSTEM_USER_ACCESS_TOKEN::" },
      { name = "META_WEBHOOK_VERIFY_TOKEN", valueFrom = "${var.meta_runtime_secret_arn}:META_WEBHOOK_VERIFY_TOKEN::" }
    ],
    (var.payment_runtime_secret_arn == null || var.payment_runtime_secret_arn == "") ? [] : [
      { name = "RAZORPAY_KEY_ID", valueFrom = "${var.payment_runtime_secret_arn}:RAZORPAY_KEY_ID::" },
      { name = "RAZORPAY_KEY_SECRET", valueFrom = "${var.payment_runtime_secret_arn}:RAZORPAY_KEY_SECRET::" },
      { name = "RAZORPAY_WEBHOOK_SECRET", valueFrom = "${var.payment_runtime_secret_arn}:RAZORPAY_WEBHOOK_SECRET::" }
    ]
  )
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = var.api_image
    essential = true
    portMappings = [{ containerPort = 4000, protocol = "tcp" }]
    environment  = local.common_api_environment
    secrets      = concat(local.core_secrets, local.external_secrets)
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "api"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.name}-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "web"
    image     = var.web_image
    essential = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "API_BASE_URL", value = "http://api.${aws_service_discovery_private_dns_namespace.main.name}:4000/v1" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.web.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "web"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = var.worker_image
    essential = true
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379" },
      { name = "EVENT_STREAM", value = "crm-ai:events" },
      { name = "META_TRANSPORT_MODE", value = var.meta_transport_mode },
      { name = "SAAS_PAYMENT_MODE", value = var.saas_payment_mode },
      { name = "SAAS_PAYMENT_PROVIDER", value = var.saas_payment_provider },
      { name = "SAAS_PAYMENT_ALLOWED_CURRENCIES", value = var.saas_payment_allowed_currencies },
      { name = "AI_WHATSAPP_EVENT_CONSUMER_ENABLED", value = "true" },
      { name = "AUTOMATION_EVENT_CONSUMER_ENABLED", value = "true" },
      { name = "AUTOMATION_SCHEDULER_ENABLED", value = "true" }
    ]
    secrets = concat(
      [{ name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn }],
      local.external_secrets
    )
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.worker.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "worker"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "migration" {
  family                   = "${local.name}-migration"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "migration"
    image     = var.migration_image
    essential = true
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "migration"
      }
    }
  }])
}

check "meta_live_configuration" {
  assert {
    condition = var.meta_transport_mode != "live" || (
      var.meta_runtime_secret_arn != null && var.meta_runtime_secret_arn != "" &&
      var.meta_graph_version != "" &&
      var.meta_app_id != "" &&
      var.meta_embedded_signup_config_id != "" &&
      var.meta_provider_business_id != "" &&
      var.meta_system_user_id != ""
    )
    error_message = "Live Meta transport requires the runtime secret ARN and all Meta public identifiers."
  }
}

check "ai_live_configuration" {
  assert {
    condition     = var.ai_transport_mode != "live" || (var.openai_api_key_secret_arn != null && var.openai_api_key_secret_arn != "")
    error_message = "Live AI transport requires an OpenAI API key secret ARN."
  }
}

check "payment_live_configuration" {
  assert {
    condition = var.saas_payment_mode != "live" || (
      var.payment_runtime_secret_arn != null &&
      var.payment_runtime_secret_arn != "" &&
      var.saas_payment_provider == "razorpay"
    )
    error_message = "Live SaaS payment mode requires the Razorpay runtime secret ARN."
  }
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn

  lifecycle {
    ignore_changes = [task_definition]
  }
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets         = aws_subnet.app[*].id
    security_groups = [aws_security_group.ecs.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  service_registries {
    registry_arn = aws_service_discovery_service.api.arn
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_ecs_service" "web" {
  name            = "web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn

  lifecycle {
    ignore_changes = [task_definition]
  }
  desired_count   = var.web_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets         = aws_subnet.app[*].id
    security_groups = [aws_security_group.ecs.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn

  lifecycle {
    ignore_changes = [task_definition]
  }
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets         = aws_subnet.app[*].id
    security_groups = [aws_security_group.ecs.id]
  }
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  target_tracking_scaling_policy_configuration {
    target_value = 65
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_target" "web" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.web.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "web_cpu" {
  name               = "${local.name}-web-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.web.resource_id
  scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
  service_namespace  = aws_appautoscaling_target.web.service_namespace
  target_tracking_scaling_policy_configuration {
    target_value = 65
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
