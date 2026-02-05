import type { NextRequest } from "next/server"
import { GetCommand } from "@aws-sdk/lib-dynamodb"
import { dynamoDocClient } from "@/lib/aws"

const API_KEY_HEADER = "x-api-key"

const parseApiKeyMap = () => {
  const raw = process.env.API_KEY_TENANT_MAP
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>
    }
  } catch {
    return null
  }
  return null
}

const apiKeyMap = parseApiKeyMap()

export type AuthResult = {
  tenantId: string
  apiKey: string
}

export const resolveTenantId = async (
  req: NextRequest
): Promise<AuthResult | null> => {
  const apiKey = req.headers.get(API_KEY_HEADER)
  if (!apiKey) return null

  if (apiKeyMap && apiKeyMap[apiKey]) {
    return { tenantId: apiKeyMap[apiKey], apiKey }
  }

  const apiKeysTableName = process.env.API_KEYS_TABLE_NAME
  if (apiKeysTableName) {
    const result = await dynamoDocClient.send(
      new GetCommand({
        TableName: apiKeysTableName,
        Key: { apiKey },
      })
    )
    const item = result.Item as
      | { tenantId?: string; status?: string }
      | undefined
    if (item?.tenantId && (item.status ?? "ACTIVE") === "ACTIVE") {
      return { tenantId: item.tenantId, apiKey }
    }
  }

  const devApiKey = process.env.DEV_API_KEY
  const devTenantId = process.env.DEV_TENANT_ID
  if (devApiKey && devTenantId && apiKey === devApiKey) {
    return { tenantId: devTenantId, apiKey }
  }

  return null
}
