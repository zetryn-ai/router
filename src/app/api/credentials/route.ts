import { NextRequest } from 'next/server'
import { createCredential } from '@/lib/credentials.repo'
import { NewCredentialSchema } from '@/lib/schemas'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = NewCredentialSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const credential = createCredential(parsed.data)
  return Response.json({ ...credential, secretValue: '••••••••' }, { status: 201 })
}
