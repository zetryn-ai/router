import { describe, it, expect } from 'vitest'
import { isProtectedPath } from '../src/middleware'

describe('isProtectedPath', () => {
  it('does not protect /proxy/* paths', () => {
    expect(isProtectedPath('/proxy/helius/foo')).toBe(false)
    expect(isProtectedPath('/proxy/helius')).toBe(false)
  })

  it('does not protect /login', () => {
    expect(isProtectedPath('/login')).toBe(false)
  })

  it('protects the dashboard root and nested pages', () => {
    expect(isProtectedPath('/')).toBe(true)
    expect(isProtectedPath('/providers/helius')).toBe(true)
    expect(isProtectedPath('/settings')).toBe(true)
  })

  it('protects the management api', () => {
    expect(isProtectedPath('/api/providers')).toBe(true)
  })
})
