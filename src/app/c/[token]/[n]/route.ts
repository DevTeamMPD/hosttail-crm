import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BubblesSchema, campaignLinks } from '@/lib/campaigns/messages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * LINE builds the link preview card of a text message by fetching the URL
 * itself ("facebookexternalhit/1.1;line-poker/1.0"), once per recipient's
 * copy. Those fetches are redirected like anyone else -- so the preview shows
 * the real page -- but must not count as the customer clicking.
 */
const NOT_A_PERSON = /line-poker|facebookexternalhit|bot\b|crawler|spider|slurp|preview|headless/i

/**
 * Tracked campaign link: /c/<recipient token>/<link number>. Records the click
 * against that recipient, then redirects to the real URL. Public (see
 * src/proxy.ts) -- the token itself is the only credential, and all it can do
 * is add a click to its own row.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string; n: string }> }) {
  const { token, n } = await ctx.params
  const index = Number(n)
  if (!/^[\w-]{16,64}$/.test(token) || !Number.isInteger(index) || index < 0 || index > 100) {
    return new NextResponse('Not found', { status: 404 })
  }

  const supabase = createAdminClient()
  const { data: recipient } = await supabase
    .from('ht_campaign_recipients')
    .select('campaign_id')
    .eq('token', token)
    .maybeSingle()
  if (!recipient) return new NextResponse('Not found', { status: 404 })

  const { data: campaign } = await supabase.from('ht_campaigns').select('messages').eq('id', recipient.campaign_id).maybeSingle()
  const bubbles = BubblesSchema.safeParse(campaign?.messages)
  const url = bubbles.success ? campaignLinks(bubbles.data)[index] : undefined
  if (!url) return new NextResponse('Not found', { status: 404 })

  const ua = req.headers.get('user-agent') ?? ''
  if (!NOT_A_PERSON.test(ua)) {
    const { error } = await supabase.rpc('ht_record_campaign_click', {
      p_token: token,
      p_link_index: index,
      p_url: url,
      p_user_agent: ua,
    })
    // A tracking failure must never stop the customer reaching the page.
    if (error) console.error('[c/redirect] record click failed', error.message)
  }

  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}
