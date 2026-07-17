import { NextRequest } from 'next/server'
import { updateCombo, deleteCombo, getComboByName } from '@/lib/combos.repo'
import { getProviderBySlug } from '@/lib/providers.repo'
import { UpdateComboSchema } from '@/lib/schemas'

function validateLlmMembers(models: string[]): string | null {
  for (const m of models) {
    const slug = m.split('/')[0]
    const provider = getProviderBySlug(slug)
    if (!provider) return `unknown provider "${slug}" in member "${m}"`
    if (!provider.isLlm) return `provider "${slug}" is not an LLM provider; combos are AI-only`
  }
  return null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params
  if (!getComboByName(name)) return Response.json({ error: 'unknown combo' }, { status: 404 })
  const body = await req.json()
  const parsed = UpdateComboSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  if (parsed.data.models) {
    const err = validateLlmMembers(parsed.data.models)
    if (err) return Response.json({ error: err }, { status: 400 })
  }
  updateCombo(name, parsed.data)
  return Response.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params
  deleteCombo(name)
  return Response.json({ ok: true })
}
