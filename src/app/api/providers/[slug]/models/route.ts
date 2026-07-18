import { NextRequest } from 'next/server'
import { getProviderBySlug, addModel, removeModel } from '@/lib/providers.repo'
import { ModelMutationSchema } from '@/lib/schemas'

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const provider = getProviderBySlug(slug)
  if (!provider) {
    return Response.json({ error: `unknown provider "${slug}"` }, { status: 404 })
  }
  if (!provider.isLlm) {
    return Response.json({ error: `provider "${slug}" is not an LLM provider` }, { status: 400 })
  }
  const body = await req.json()
  const parsed = ModelMutationSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  addModel(provider.id, parsed.data.model)
  return Response.json({ ok: true })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const provider = getProviderBySlug(slug)
  if (!provider) {
    return Response.json({ error: `unknown provider "${slug}"` }, { status: 404 })
  }
  const body = await req.json()
  const parsed = ModelMutationSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  removeModel(provider.id, parsed.data.model)
  return Response.json({ ok: true })
}
