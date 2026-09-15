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
  '/login',
  '/api/auth',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
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
  const role = request.cookies.get('ht_role')?.value
  if (!role) {
    // Logged into Supabase Auth but the RBAC cookie is missing (e.g. logged
    // in before this app set it up) -- force a clean re-login rather than
    // silently falling back to the most restrictive role.
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (role === 'admin') return proxyResponse

  if (!isPathAllowed(pathname, role)) {
    return NextResponse.redirect(new URL(getHomePath(), request.url))
  }
  return proxyResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
