import { NextRequest } from 'next/server'
import { getProviderBySlug, setRotationStrategy } from '@/lib/providers.repo'
import { UpdateProviderSchema } from '@/lib/schemas'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const provider = getProviderBySlug(slug)
  if (!provider) {
    return Response.json({ error: `unknown provider "${slug}"` }, { status: 404 })
  }
  const body = await req.json()
  const parsed = UpdateProviderSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  setRotationStrategy(provider.id, parsed.data.rotationStrategy)
  return Response.json({ ok: true })
}
