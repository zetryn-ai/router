import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'

export function isProtectedPath(pathname: string): boolean {
  if (pathname === '/proxy' || pathname.startsWith('/proxy/')) return false
  if (pathname === '/login') return false
  return true
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (!isProtectedPath(pathname)) return NextResponse.next()

  const token = req.cookies.get('session')?.value
  const valid = token ? await verifySessionToken(token) : false

  if (!valid) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
