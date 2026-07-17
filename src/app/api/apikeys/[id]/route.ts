import { NextRequest } from 'next/server'
import { deleteApiKey } from '@/lib/apikeys.repo'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const n = Number(id)
  if (!Number.isInteger(n)) return Response.json({ error: 'invalid id' }, { status: 400 })
  deleteApiKey(n)
  return Response.json({ ok: true })
}
