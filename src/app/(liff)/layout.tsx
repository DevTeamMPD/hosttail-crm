/**
 * Route group for the public LIFF app. No Supabase session, no dashboard
 * chrome -- src/proxy.ts explicitly allowlists everything under /register so
 * this never gets redirected to a staff login.
 */
export default function LiffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: 'linear-gradient(180deg, var(--ht-bg-from) 0%, var(--ht-bg-to) 100%)',
      }}
    >
      <div className="mx-auto w-full max-w-md min-h-screen bg-transparent">{children}</div>
    </div>
  )
}
