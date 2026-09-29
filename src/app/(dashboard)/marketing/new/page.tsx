import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { roleAtLeast } from '@/lib/permissions'
import { Composer } from '../composer'
import { DryRunNotice, loadComposerData } from '../composer-data'

export const metadata: Metadata = { title: 'สร้างแคมเปญ — Hosttail CRM' }
export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ segment?: string }>
}

export default async function NewCampaignPage({ searchParams }: Props) {
  const session = await getStaffSession()
  if (!roleAtLeast(session?.role, 'marketing')) redirect('/marketing')
  const { segment } = await searchParams
  const data = await loadComposerData()

  return (
    <div className="space-y-4">
      <div>
        <Link href="/marketing" className="text-xs text-gray-500 hover:underline">
          ← การตลาด
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">สร้างแคมเปญ LINE</h1>
      </div>
      <DryRunNotice dryRun={data.dryRun} />
      <Composer
        campaign={{
          id: null,
          name: '',
          segmentId: data.segments.some((s) => s.id === segment) ? (segment as string) : '',
          bubbles: [],
        }}
        {...data}
      />
    </div>
  )
}
