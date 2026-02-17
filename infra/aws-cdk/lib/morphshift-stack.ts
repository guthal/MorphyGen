import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as iam from "aws-cdk-lib/aws-iam"
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources"
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2"
import * as apigwv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INPUT_PREFIX = "inputs/"
const OUTPUT_PREFIX = "outputs/"

export class MorphShiftStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const bucket = new s3.Bucket(this, "JobsBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(7),
          prefix: INPUT_PREFIX,
        },
        {
          expiration: cdk.Duration.days(7),
          prefix: OUTPUT_PREFIX,
        },
      ],
    })

    const jobsTable = new dynamodb.Table(this, "JobsTable", {
      partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    })

    const tenantConfigTable = new dynamodb.Table(this, "TenantConfigTable", {
      partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    })

    const apiKeysTable = new dynamodb.Table(this, "ApiKeysTable", {
      partitionKey: { name: "apiKey", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    })

    apiKeysTable.addGlobalSecondaryIndex({
      indexName: "TenantIndex",
      partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    jobsTable.addGlobalSecondaryIndex({
      indexName: "TenantCreatedAtIndex",
      partitionKey: { name: "tenantId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    const renderDlq = new sqs.Queue(this, "RenderDlq", {
      retentionPeriod: cdk.Duration.days(14),
    })

    const renderQueue = new sqs.Queue(this, "RenderQueue", {
      visibilityTimeout: cdk.Duration.minutes(5),
      deadLetterQueue: {
        queue: renderDlq,
        maxReceiveCount: 3,
      },
    })

    const webhookDlq = new sqs.Queue(this, "WebhookDlq", {
      retentionPeriod: cdk.Duration.days(14),
    })

    const webhookQueue = new sqs.Queue(this, "WebhookQueue", {
      visibilityTimeout: cdk.Duration.minutes(1),
      deadLetterQueue: {
        queue: webhookDlq,
        maxReceiveCount: 5,
      },
    })

    const renderWorker = new lambda.Function(this, "RenderWorker", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambda/render-worker")
      ),
      timeout: cdk.Duration.minutes(5),
      memorySize: 2048,
      environment: {
        JOBS_TABLE_NAME: jobsTable.tableName,
        JOBS_BUCKET_NAME: bucket.bucketName,
        INPUT_PREFIX,
        OUTPUT_PREFIX,
        WEBHOOK_QUEUE_URL: webhookQueue.queueUrl,
        SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      },
    })

    renderWorker.addEventSource(
      new lambdaEventSources.SqsEventSource(renderQueue, {
        batchSize: 5,
      })
    )

    renderWorker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [bucket.arnForObjects(`${INPUT_PREFIX}*`)],
      })
    )

    renderWorker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [bucket.arnForObjects(`${OUTPUT_PREFIX}*`)],
      })
    )

    renderWorker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
        resources: [jobsTable.tableArn],
      })
    )

    renderWorker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [jobsTable.tableArn, `${jobsTable.tableArn}/index/*`],
      })
    )

    renderWorker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
        resources: [renderQueue.queueArn],
      })
    )

    renderWorker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["sqs:SendMessage"],
        resources: [webhookQueue.queueArn],
      })
    )

    const webhookDispatcher = new lambda.Function(this, "WebhookDispatcher", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambda/webhook-dispatcher")
      ),
      timeout: cdk.Duration.minutes(1),
      memorySize: 512,
      environment: {
        TENANT_CONFIG_TABLE_NAME: tenantConfigTable.tableName,
        JOBS_BUCKET_NAME: bucket.bucketName,
      },
    })

    webhookDispatcher.addEventSource(
      new lambdaEventSources.SqsEventSource(webhookQueue, {
        batchSize: 10,
      })
    )

    webhookDispatcher.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem"],
        resources: [tenantConfigTable.tableArn],
      })
    )

    webhookDispatcher.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [bucket.arnForObjects(`${OUTPUT_PREFIX}*`)],
      })
    )

    const webhookApiHandler = new lambda.Function(this, "WebhookApiHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../lambda/webhook-api")),
      timeout: cdk.Duration.seconds(10),
      memorySize: 512,
      environment: {
        API_KEYS_TABLE_NAME: apiKeysTable.tableName,
        TENANT_CONFIG_TABLE_NAME: tenantConfigTable.tableName,
      },
    })

    webhookApiHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem"],
        resources: [apiKeysTable.tableArn, tenantConfigTable.tableArn],
      })
    )

    webhookApiHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:PutItem"],
        resources: [tenantConfigTable.tableArn],
      })
    )

    const webhookHttpApi = new apigwv2.HttpApi(this, "WebhookHttpApi", {
      apiName: "morphshift-webhook-api",
      corsPreflight: {
        allowHeaders: ["Authorization", "Content-Type", "X-Api-Key"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["*"],
      },
    })

    const webhookIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      "WebhookApiIntegration",
      webhookApiHandler
    )

    webhookHttpApi.addRoutes({
      path: "/v1/webhooks",
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT],
      integration: webhookIntegration,
    })

    webhookHttpApi.addRoutes({
      path: "/v1/webhooks/test",
      methods: [apigwv2.HttpMethod.POST],
      integration: webhookIntegration,
    })

    new cdk.CfnOutput(this, "JobsBucketName", {
      value: bucket.bucketName,
    })

    new cdk.CfnOutput(this, "JobsTableName", {
      value: jobsTable.tableName,
    })

    new cdk.CfnOutput(this, "TenantConfigTableName", {
      value: tenantConfigTable.tableName,
    })

    new cdk.CfnOutput(this, "ApiKeysTableName", {
      value: apiKeysTable.tableName,
    })

    new cdk.CfnOutput(this, "RenderQueueUrl", {
      value: renderQueue.queueUrl,
    })

    new cdk.CfnOutput(this, "WebhookQueueUrl", {
      value: webhookQueue.queueUrl,
    })

    new cdk.CfnOutput(this, "RenderDlqUrl", {
      value: renderDlq.queueUrl,
    })

    new cdk.CfnOutput(this, "WebhookDlqUrl", {
      value: webhookDlq.queueUrl,
    })

    new cdk.CfnOutput(this, "RenderWorkerName", {
      value: renderWorker.functionName,
    })

    new cdk.CfnOutput(this, "WebhookDispatcherName", {
      value: webhookDispatcher.functionName,
    })

    new cdk.CfnOutput(this, "WebhookApiUrl", {
      value: webhookHttpApi.apiEndpoint,
    })
  }
}
