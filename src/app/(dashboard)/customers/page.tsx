import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { roleAtLeast } from '@/lib/permissions'
import { formatThaiDate } from '@/lib/format-th'
import { PET_TYPES } from '@/lib/brand'
import { maskPhone } from '@/lib/mask'
import { CustomerSearch } from './search'

export const metadata: Metadata = { title: 'ลูกค้า — Hosttail CRM' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
// Keyed as plain strings: ht_members.pet_types is text[] in the database,
// so values are not narrowed to the PetType union at runtime.
const PET_LABEL = new Map<string, string>(PET_TYPES.map((p) => [p.value, p.label]))

interface Props {
  searchParams: Promise<{ q?: string; page?: string; source?: string; bound?: string }>
}

export default async function CustomersPage({ searchParams }: Props) {
  const params = await searchParams
  const page = Math.max(1, Number(params.page ?? '1') || 1)
  const q = (params.q ?? '').trim()

  const session = await getStaffSession()
  // A viewer can see that a customer exists without being handed a list of
  // reachable phone numbers. Marketing and admin need the real thing to
  // resolve support cases.
  const canSeePhone = roleAtLeast(session?.role, 'marketing')

  const supabase = await createClient()

  let query = supabase
    .from('ht_members')
    .select('id, full_name, line_display_name, phone, province_code, pet_types, points_balance, source, registered_at, is_test', {
      count: 'exact',
    })
    .eq('status', 'active')
    .order('registered_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (q) {
    // Digits-only input is almost always a phone; anything else is a name.
    const digits = q.replace(/\D/g, '')
    query = digits.length >= 4 ? query.ilike('phone', `%${digits}%`) : query.ilike('full_name', `%${q}%`)
  }
  if (params.source) query = query.eq('source', params.source)
  if (params.bound === 'no') query = query.eq('is_test', false)

  const { data: members, count, error } = await query

  // This list deliberately KEEPS test accounts (tagged) so staff can find and
  // inspect them -- unlike /overview, whose KPIs exclude them. Spelling that
  // out here stops the two pages looking like they disagree.
  const [{ count: testCount }, { data: provinces }, { data: bindings }] = await Promise.all([
    supabase.from('ht_members').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('is_test', true),
    supabase.from('ht_provinces').select('code, name_th'),
    supabase
      .from('ht_member_platform_accounts')
      .select('member_id')
      .eq('status', 'active')
      .in('member_id', (members ?? []).map((m) => m.id).length ? (members ?? []).map((m) => m.id) : ['']),
  ])
  const provinceName = new Map((provinces ?? []).map((p) => [p.code, p.name_th]))
  const boundIds = new Set((bindings ?? []).map((b) => b.member_id))

  const total = count ?? 0
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">ลูกค้า</h1>
          <p className="text-sm text-gray-500">
            {total.toLocaleString()} คน
            {testCount ? ` · รวมบัญชีทดสอบ ${testCount} รายการ (หน้าภาพรวมไม่นับรวม)` : ''}
          </p>
        </div>
        <CustomerSearch initialQuery={q} initialSource={params.source ?? ''} />
      </div>

      {error && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: '#fdecea', color: 'var(--ht-error)' }}>
          โหลดข้อมูลไม่สำเร็จ: {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-4 py-2.5 font-medium">ชื่อ</th>
              <th className="px-4 py-2.5 font-medium">เบอร์โทร</th>
              <th className="px-4 py-2.5 font-medium">จังหวัด</th>
              <th className="px-4 py-2.5 font-medium">สัตว์เลี้ยง</th>
              <th className="px-4 py-2.5 text-right font-medium">แต้ม</th>
              <th className="px-4 py-2.5 font-medium">ผูกบัญชี</th>
              <th className="px-4 py-2.5 font-medium">สมัครเมื่อ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {!members?.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  ไม่พบลูกค้าตามเงื่อนไขนี้
                </td>
              </tr>
            )}
            {members?.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/customers/${m.id}`} className="font-medium" style={{ color: 'var(--ht-primary)' }}>
                    {m.full_name ?? m.line_display_name ?? '(ไม่ระบุชื่อ)'}
                  </Link>
                  <div className="flex gap-1 pt-0.5">
                    {m.source === 'legacy_sheet' && <Tag text="สมาชิกเดิม" color="#6b7280" bg="#f3f4f6" />}
                    {m.is_test && <Tag text="บัญชีทดสอบ" color="var(--ht-warning)" bg="var(--ht-warning-bg)" />}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {m.phone ? (canSeePhone ? m.phone : maskPhone(m.phone)) : '—'}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{provinceName.get(m.province_code ?? '') ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">
                  {m.pet_types?.length ? m.pet_types.map((p) => PET_LABEL.get(p) ?? p).join(', ') : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                  {(m.points_balance ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-2.5">
                  {boundIds.has(m.id) ? (
                    <Tag text="ผูกแล้ว" color="var(--ht-success)" bg="var(--ht-success-bg)" />
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-500">{formatThaiDate(m.registered_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">
            หน้า {page} จาก {lastPage}
          </p>
          <div className="flex gap-2">
            <PageLink page={page - 1} disabled={page <= 1} params={params} label="ก่อนหน้า" />
            <PageLink page={page + 1} disabled={page >= lastPage} params={params} label="ถัดไป" />
          </div>
        </div>
      )}
    </div>
  )
}

function PageLink({
  page,
  disabled,
  params,
  label,
}: {
  page: number
  disabled: boolean
  params: Record<string, string | undefined>
  label: string
}) {
  if (disabled) {
    return <span className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-300">{label}</span>
  }
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v && k !== 'page') sp.set(k, v)
  sp.set('page', String(page))
  return (
    <Link href={`/customers?${sp}`} className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50">
      {label}
    </Link>
  )
}

function Tag({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color, background: bg }}>
      {text}
    </span>
  )
}
