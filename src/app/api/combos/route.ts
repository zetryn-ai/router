import { NextRequest } from 'next/server'
import { listCombos, createCombo, getComboByName } from '@/lib/combos.repo'
import { getProviderBySlug } from '@/lib/providers.repo'
import { NewComboSchema } from '@/lib/schemas'

// Every member "slug/model" must reference an is_llm provider — combos are AI-only.
function validateLlmMembers(models: string[]): string | null {
  for (const m of models) {
    const slug = m.split('/')[0]
    const provider = getProviderBySlug(slug)
    if (!provider) return `unknown provider "${slug}" in member "${m}"`
    if (!provider.isLlm) return `provider "${slug}" is not an LLM provider; combos are AI-only`
  }
  return null
}

export async function GET() {
  return Response.json(listCombos())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = NewComboSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  if (getComboByName(parsed.data.name)) {
    return Response.json({ error: `combo "${parsed.data.name}" already exists` }, { status: 409 })
  }
  const err = validateLlmMembers(parsed.data.models)
  if (err) return Response.json({ error: err }, { status: 400 })
  const combo = createCombo(parsed.data)
  return Response.json(combo, { status: 201 })
}
