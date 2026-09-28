export type HtRole = 'admin' | 'marketing' | 'viewer'

/**
 * Dashboard path allowlist per role. `admin` always gets '*'. Checked by
 * src/proxy.ts (navigation gate only) AND independently inside every server
 * action / route handler that mutates data -- the proxy stops a role from
 * *navigating* to a page, but a viewer could still call a server action
 * directly from devtools if the action itself didn't also check the role.
 */
export const ROLE_PATHS: Record<HtRole, string[] | '*'> = {
  admin: '*',
  marketing: ['/overview', '/customers', '/segments', '/broadcasts', '/approvals'],
  viewer: ['/overview', '/customers', '/segments'],
}

export function isPathAllowed(pathname: string, role: string): boolean {
  const allowed = ROLE_PATHS[role as HtRole] ?? ROLE_PATHS.viewer
  if (allowed === '*') return true
  return allowed.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

// All roles share the same landing page today. Takes no role parameter --
// add one back if a role-specific home path is ever needed.
export function getHomePath(): string {
  return '/overview'
}

/** Role hierarchy for server-action guards: requireRole('marketing') also passes for 'admin'. */
export function roleAtLeast(role: string | null | undefined, min: HtRole): boolean {
  const order: HtRole[] = ['viewer', 'marketing', 'admin']
  const idx = order.indexOf(role as HtRole)
  return idx >= 0 && idx >= order.indexOf(min)
}
