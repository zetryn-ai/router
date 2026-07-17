import { z } from 'zod'

export const InjectLocationSchema = z.enum(['query', 'header', 'path'])

export const NewProviderSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes'),
  name: z.string().min(1),
  defaultInjectLocation: InjectLocationSchema,
  defaultInjectKeyName: z.string().nullable().optional(),
  defaultBaseUrl: z.string().url().nullable().optional(),
})
export type NewProviderInput = z.infer<typeof NewProviderSchema>

export const NewCredentialSchema = z.object({
  providerId: z.number().int().positive(),
  label: z.string().min(1),
  secretValue: z.string().min(1),
  baseUrlOverride: z.string().url().nullable().optional(),
  injectLocationOverride: InjectLocationSchema.nullable().optional(),
  injectKeyNameOverride: z.string().nullable().optional(),
})
export type NewCredentialInput = z.infer<typeof NewCredentialSchema>
