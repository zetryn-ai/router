import { NextRequest } from 'next/server'
import { markActive, markDisabled, deleteCredential } from '@/lib/credentials.repo'
import { z } from 'zod'

const PatchSchema = z.object({ action: z.enum(['reactivate', 'disable']) })

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const credentialId = Number(id)
  if (!Number.isInteger(credentialId)) {
    return Response.json({ error: 'invalid credential id' }, { status: 400 })
  }
  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  if (parsed.data.action === 'reactivate') markActive(credentialId)
  if (parsed.data.action === 'disable') markDisabled(credentialId)
  return Response.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const credentialId = Number(id)
  if (!Number.isInteger(credentialId)) {
    return Response.json({ error: 'invalid credential id' }, { status: 400 })
  }
  deleteCredential(credentialId)
  return Response.json({ ok: true })
}
