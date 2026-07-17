import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSetting, setSetting } from '@/lib/settings.repo'
import { hashPassword, verifyPassword } from '@/lib/auth'

const PasswordChangeSchema = z.object({
  type: z.literal('password'),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

const CooldownChangeSchema = z.object({
  type: z.literal('cooldown'),
  providerSlug: z.string().min(1),
  seconds: z.number().int().positive(),
})

const RequireApiKeySchema = z.object({
  type: z.literal('require_api_key'),
  enabled: z.boolean(),
})

const BodySchema = z.discriminatedUnion('type', [
  PasswordChangeSchema,
  CooldownChangeSchema,
  RequireApiKeySchema,
])

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  if (parsed.data.type === 'password') {
    const storedHash = getSetting('dashboard_password_hash')
    if (!storedHash || !verifyPassword(parsed.data.currentPassword, storedHash)) {
      return Response.json({ error: 'current password is incorrect' }, { status: 401 })
    }
    setSetting('dashboard_password_hash', hashPassword(parsed.data.newPassword))
    return Response.json({ ok: true })
  }

  if (parsed.data.type === 'require_api_key') {
    setSetting('require_api_key', parsed.data.enabled ? '1' : '0')
    return Response.json({ ok: true })
  }

  setSetting(`cooldown_seconds_default:${parsed.data.providerSlug}`, String(parsed.data.seconds))
  return Response.json({ ok: true })
}
