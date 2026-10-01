import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isPathAllowed, getHomePath } from '@/lib/permissions'

/**
 * Surfaces that authenticate themselves and must NEVER be redirected to
 * /login -- doing so would break them outright, not just annoy a user:
 *
 *   /register    public LIFF app. Auth is a verified LINE ID token exchanged
 *                for our own Bearer token (see src/lib/liff/*), never a
 *                Supabase Auth cookie -- there is no session to check here.
 *   /home
 *   /profile     the bottom-nav app shell (src/app/(liff)/(app)/*) -- same
 *   /warranty    LIFF-token auth as /register, just split across 4 tab
 *   /privileges  routes instead of one page.
 *   /api/liff/*  LIFF API. Auth is `Authorization: Bearer <app token>`,
 *                verified inside each route handler via readLiffSession().
 *   /api/line/*  LINE webhook + quota check. The webhook verifies
 *                `X-Line-Signature` itself and MUST return 200 even on our
 *                own errors -- if this proxy ever 307-redirected a webhook
 *                call to /login, LINE would see a non-2xx/redirect response
 *                enough times to disable the webhook endpoint permanently.
 *   /api/cron/*  Vercel Cron. Auth is verifyCronRequest() against CRON_SECRET.
 *   /c/*         Tracked links in marketing campaigns, tapped by customers in
 *                LINE. The per-recipient token in the URL is the only auth.
 *   /login       Phase 2 (not built yet) -- allowlisted so it can add a
 *                Supabase Auth session without ever being unreachable itself.
 *   /api/auth/*  Phase 2 (not built yet) -- login/logout route handlers.
 */
const PUBLIC_PREFIXES = [
  '/register',
  '/home',
  '/profile',
  '/warranty',
  '/privileges',
  '/api/liff',
  '/api/line',
  '/api/cron',
  '/c',
  '/login',
  '/api/auth',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  // The bare domain (and the legacy static page's /index.html) belong to
  // customers, not staff: send them to the LIFF form instead of the staff
  // login. The query string is kept so LIFF's liff.state survives.
  if (pathname === '/' || pathname === '/index.html') {
    const url = request.nextUrl.clone()
    url.pathname = '/register'
    return NextResponse.redirect(url)
  }
  if (isPublic(pathname)) return NextResponse.next()

  let proxyResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          proxyResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            proxyResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Role is read from a cookie set at login time by /api/auth/login (Phase 2)
  // so the dashboard doesn't hit ht_staff on every single navigation.
  let role = request.cookies.get('ht_role')?.value
  if (!role) {
    // The Supabase session outlives the 12h ht_role cookie. Redirecting to
    // /login here loops forever: /login sees a valid staff session and
    // redirects straight back. Re-derive the role from ht_staff instead (one
    // lookup, only when the cookie is missing) and re-issue the cookie.
    const { data: staff } = await supabase
      .from('ht_staff')
      .select('role')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (!staff) {
      // Not (or no longer) staff: /login's getStaffSession() returns null
      // too, so it shows the form instead of bouncing back.
      return NextResponse.redirect(new URL('/login', request.url))
    }
    role = staff.role as string
    proxyResponse.cookies.set('ht_role', role, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    })
  }
  if (role === 'admin') return proxyResponse

  if (!isPathAllowed(pathname, role)) {
    const res = NextResponse.redirect(new URL(getHomePath(), request.url))
    proxyResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }
  return proxyResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
