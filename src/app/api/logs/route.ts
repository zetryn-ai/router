import { NextRequest } from 'next/server'
import { listLogs } from '@/lib/logs.repo'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const logs = listLogs({
    providerSlug: params.get('providerSlug') ?? undefined,
    statusCode: params.get('statusCode') ? Number(params.get('statusCode')) : undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    offset: params.get('offset') ? Number(params.get('offset')) : undefined,
  })
  return Response.json(logs)
}
