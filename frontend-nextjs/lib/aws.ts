import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { S3Client } from "@aws-sdk/client-s3"
import { SQSClient } from "@aws-sdk/client-sqs"
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb"

const region =
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  process.env.NEXT_PUBLIC_AWS_REGION ||
  "us-east-1"

export const dynamoClient = new DynamoDBClient({ region })
export const s3Client = new S3Client({ region })
export const sqsClient = new SQSClient({ region })
export const dynamoDocClient = DynamoDBDocumentClient.from(dynamoClient)
