import { z } from 'zod'

export const InjectLocationSchema = z.enum(['query', 'header', 'path'])
export const RotationStrategySchema = z.enum(['round_robin', 'lru', 'priority'])
export type RotationStrategy = z.infer<typeof RotationStrategySchema>

export const ProviderCategorySchema = z.enum(['rpc', 'data', 'swap', 'llm', 'other'])
export type ProviderCategory = z.infer<typeof ProviderCategorySchema>

export const NewProviderSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes'),
  name: z.string().min(1),
  defaultInjectLocation: InjectLocationSchema,
  defaultInjectKeyName: z.string().nullable().optional(),
  defaultBaseUrl: z.string().url().nullable().optional(),
  rotationStrategy: RotationStrategySchema.optional(),
  // Template applied to the injected value. Use "{key}" as the secret placeholder,
  // e.g. "Bearer {key}" for Authorization-header providers. Null = inject the raw secret.
  defaultInjectValueTemplate: z.string().nullable().optional(),
  category: ProviderCategorySchema.optional(),
  isLlm: z.boolean().optional(),
  models: z.array(z.string()).optional(),
  stickyLimit: z.number().int().positive().optional(),
  isFree: z.boolean().optional(),
})
export type NewProviderInput = z.infer<typeof NewProviderSchema>

export const NewCredentialSchema = z.object({
  providerId: z.number().int().positive(),
  label: z.string().min(1),
  secretValue: z.string().min(1),
  baseUrlOverride: z.string().url().nullable().optional(),
  injectLocationOverride: InjectLocationSchema.nullable().optional(),
  injectKeyNameOverride: z.string().nullable().optional(),
  // Lower number = higher priority (tried first) under the "priority" strategy.
  priority: z.number().int().optional(),
})
export type NewCredentialInput = z.infer<typeof NewCredentialSchema>

export const UpdateProviderSchema = z.object({
  rotationStrategy: RotationStrategySchema.optional(),
  stickyLimit: z.number().int().positive().optional(),
})

export const NewApiKeySchema = z.object({
  label: z.string().min(1),
})

export const ComboStrategySchema = z.enum(['fallback', 'round_robin', 'fusion', 'capacity'])
export type ComboStrategy = z.infer<typeof ComboStrategySchema>

export const NewComboSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9._-]+$/, 'only letters, numbers, -, _ and . allowed'),
  strategy: ComboStrategySchema,
  models: z.array(z.string().min(1)).min(1),
})

export const UpdateComboSchema = z.object({
  strategy: ComboStrategySchema.optional(),
  models: z.array(z.string().min(1)).min(1).optional(),
})

export const ModelMutationSchema = z.object({
  model: z.string().min(1),
})
