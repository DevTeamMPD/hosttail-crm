import { type NextRequest } from 'next/server'

export function verifyCronRequest(request: NextRequest): boolean {
  // Dev bypass — CRON_SECRET is never set in local .env.local for crons
  if (process.env.NODE_ENV === 'development') return true

  const secret = process.env.CRON_SECRET
  if (!secret) return false

  // Vercel passes Authorization: Bearer <CRON_SECRET> for scheduled cron jobs
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true

  // Allow manual trigger with X-Cron-Secret header (Postman / admin panel)
  if (request.headers.get('x-cron-secret') === secret) return true

  return false
}
