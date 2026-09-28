'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { LiffMemberPublic } from '@/lib/liff/client'

interface MemberContextValue {
  member: LiffMemberPublic
  setMember: (member: LiffMemberPublic) => void
}

const MemberContext = createContext<MemberContextValue | null>(null)

export function MemberProvider({
  member,
  setMember,
  children,
}: MemberContextValue & { children: ReactNode }) {
  return <MemberContext.Provider value={{ member, setMember }}>{children}</MemberContext.Provider>
}

/** Only usable inside the (app) tab shell -- see app-shell.tsx, which is where the LIFF auth gate lives. */
export function useMember(): MemberContextValue {
  const ctx = useContext(MemberContext)
  if (!ctx) throw new Error('useMember() must be used within the (app) tab shell')
  return ctx
}
