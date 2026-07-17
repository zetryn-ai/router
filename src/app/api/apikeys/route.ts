import { NextRequest } from 'next/server'
import { createApiKey, listApiKeys } from '@/lib/apikeys.repo'
import { NewApiKeySchema } from '@/lib/schemas'

export async function GET() {
  return Response.json(listApiKeys())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = NewApiKeySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { record, plaintext } = createApiKey(parsed.data.label)
  // plaintext returned ONCE — the client must surface it immediately
  return Response.json({ ...record, plaintext }, { status: 201 })
}
