import { NextRequest } from 'next/server'
import { handleProxyRequest } from '@/lib/proxy-orchestrator'

// hop-by-hop and routing headers that must not be forwarded upstream
const STRIP_REQUEST_HEADERS = ['host', 'connection', 'content-length', 'accept-encoding']

async function handle(req: NextRequest, params: { slug: string; path?: string[] }) {
  const path = '/' + (params.path ?? []).join('/')
  const query = req.nextUrl.searchParams
  const method = req.method
  const body = method === 'GET' || method === 'HEAD' ? null : await req.arrayBuffer()
  const headers: Record<string, string> = {}
  let authorization: string | null = null
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'authorization') {
      authorization = value // consumed by the router for consumer-key auth, never forwarded upstream
      return
    }
    if (!STRIP_REQUEST_HEADERS.includes(lower)) {
      headers[key] = value
    }
  })

  const result = await handleProxyRequest({
    slug: params.slug,
    path,
    query,
    method,
    body: body as BodyInit | null,
    headers,
    fetchFn: fetch,
    authorization,
  })

  if (result.stream !== undefined) {
    return new Response(result.stream, { status: result.status, headers: result.headers })
  }
  return Response.json(result.body, { status: result.status })
}

type Ctx = { params: Promise<{ slug: string; path?: string[] }> }

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, await ctx.params)
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return handle(req, await ctx.params)
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return handle(req, await ctx.params)
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(req, await ctx.params)
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(req, await ctx.params)
}
