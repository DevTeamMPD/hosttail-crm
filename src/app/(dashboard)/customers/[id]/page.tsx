import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { roleAtLeast } from '@/lib/permissions'
import { formatThaiDate, daysUntil } from '@/lib/format-th'
import { channelMeta, PET_TYPES } from '@/lib/brand'
import { maskPhone } from '@/lib/mask'

export const metadata: Metadata = { title: 'รายละเอียดลูกค้า — Hosttail CRM' }
export const dynamic = 'force-dynamic'

// Keyed as plain strings: ht_members.pet_types is text[] in the database,
// so values are not narrowed to the PetType union at runtime.
const PET_LABEL = new Map<string, string>(PET_TYPES.map((p) => [p.value, p.label]))

const KIND_LABEL: Record<string, string> = {
  earn: 'ได้รับแต้ม',
  bonus: 'โบนัส',
  reverse: 'กลับรายการ',
  redeem: 'แลกแต้ม',
  expire: 'หมดอายุ',
  adjust: 'ปรับปรุง',
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getStaffSession()
  const canSeePhone = roleAtLeast(session?.role, 'marketing')
  const supabase = await createClient()

  const { data: member } = await supabase
    .from('ht_members')
    .select(
      'id, full_name, line_display_name, line_picture_url, phone, province_code, pet_types, pet_other, note, points_balance, points_lifetime, tier_code, source, status, is_test, registered_at, merged_into'
    )
    .eq('id', id)
    .limit(1)
    .maybeSingle()

  if (!member) notFound()

  const [{ data: regs }, { data: items }, { data: ledger }, { data: bindings }, { data: province }, { data: consents }] =
    await Promise.all([
      supabase
        .from('ht_warranty_registrations')
        .select('id, channel, order_ref_raw, status, link_status, matched_order_no, matched_amount, submitted_at, review_note')
        .eq('member_id', id)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('ht_warranty_items')
        .select('id, registration_id, sku, product_name, quantity, warranty_start, warranty_end, status')
        .eq('member_id', id)
        .order('warranty_end'),
      supabase
        .from('ht_points_ledger')
        .select('id, kind, points, source_type, note, created_at')
        .eq('member_id', id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('ht_member_platform_accounts')
        .select('id, shop, account_no, account_name, status, bound_via, bound_at')
        .eq('member_id', id)
        .order('bound_at', { ascending: false }),
      member.province_code
        ? supabase.from('ht_provinces').select('name_th').eq('code', member.province_code).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('ht_member_consents').select('kind, granted, source').eq('member_id', id),
    ])

  return (
    <div className="space-y-4">
      <Link href="/customers" className="text-sm" style={{ color: 'var(--ht-primary)' }}>
        ← กลับไปรายชื่อลูกค้า
      </Link>

      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
        {member.line_picture_url ? (
          <Image
            src={member.line_picture_url}
            alt=""
            width={56}
            height={56}
            className="rounded-full"
            unoptimized
          />
        ) : (
          <div className="h-14 w-14 rounded-full bg-gray-200" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-900">
              {member.full_name ?? member.line_display_name ?? '(ไม่ระบุชื่อ)'}
            </h1>
            {member.source === 'legacy_sheet' && <Tag text="สมาชิกเดิม" color="#6b7280" bg="#f3f4f6" />}
            {member.is_test && <Tag text="บัญชีทดสอบ" color="var(--ht-warning)" bg="var(--ht-warning-bg)" />}
            {member.merged_into && <Tag text="ถูกรวมบัญชีแล้ว" color="var(--ht-error)" bg="#fdecea" />}
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {member.phone ? (canSeePhone ? member.phone : maskPhone(member.phone)) : 'ไม่มีเบอร์โทร'}
            {' · '}
            {province?.name_th ?? 'ไม่ระบุจังหวัด'}
            {' · '}สมาชิกตั้งแต่ {formatThaiDate(member.registered_at)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {member.pet_types?.length ? member.pet_types.map((p) => PET_LABEL.get(p) ?? p).join(', ') : 'ไม่ระบุสัตว์เลี้ยง'}
            {member.pet_other ? ` (${member.pet_other})` : ''}
            {member.line_display_name ? ` · LINE: ${member.line_display_name}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold" style={{ color: 'var(--ht-primary)' }}>
            {(member.points_balance ?? 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-400">แต้มคงเหลือ · สะสม {(member.points_lifetime ?? 0).toLocaleString()}</p>
        </div>
      </section>

      {member.note && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">หมายเหตุจากลูกค้า</h2>
          <p className="text-sm text-gray-600">{member.note}</p>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white">
        <SectionHeader title="การลงทะเบียนรับประกัน" count={regs?.length ?? 0} />
        {!regs?.length ? (
          <Empty text="ยังไม่มีการลงทะเบียน" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {regs.map((r) => {
              const meta = channelMeta(r.channel)
              const own = (items ?? []).filter((i) => i.registration_id === r.id)
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800">
                        {meta.icon} {meta.label} · {r.order_ref_raw}
                      </p>
                      <p className="text-xs text-gray-400">
                        ส่งเมื่อ {formatThaiDate(r.submitted_at)}
                        {r.matched_order_no ? ` · จับคู่กับบิล ${r.matched_order_no}` : ''}
                        {r.matched_amount ? ` · ฿${Number(r.matched_amount).toLocaleString()}` : ''}
                      </p>
                    </div>
                    <RegStatus status={r.status} />
                  </div>
                  {r.review_note && <p className="mt-1 text-xs text-gray-400">หมายเหตุ: {r.review_note}</p>}
                  {own.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-gray-100 pl-3">
                      {own.map((i) => {
                        const left = i.warranty_end ? daysUntil(i.warranty_end) : null
                        return (
                          <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate text-gray-600">{i.product_name ?? i.sku ?? 'สินค้า'}</span>
                            <span className="shrink-0 text-gray-400">
                              {formatThaiDate(i.warranty_start)} – {formatThaiDate(i.warranty_end)}
                              {i.status === 'active' && left !== null && left >= 0 ? ` (เหลือ ${left} วัน)` : ''}
                              {i.status !== 'active' ? ` (${i.status})` : ''}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white">
          <SectionHeader title="บัญชีแพลตฟอร์มที่ผูกไว้" count={bindings?.length ?? 0} />
          {!bindings?.length ? (
            <Empty text="ยังไม่ผูกบัญชี — ออเดอร์ถัดไปต้องกรอกเลขเอง" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {bindings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-gray-800">
                      {b.shop} · {b.account_name ?? b.account_no}
                    </p>
                    <p className="text-xs text-gray-400">
                      {b.account_no} · ผูกเมื่อ {formatThaiDate(b.bound_at)} ({b.bound_via})
                    </p>
                  </div>
                  {b.status === 'active' ? (
                    <Tag text="ใช้งาน" color="var(--ht-success)" bg="var(--ht-success-bg)" />
                  ) : (
                    <Tag text="เพิกถอนแล้ว" color="#6b7280" bg="#f3f4f6" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white">
          <SectionHeader title="ประวัติแต้ม" count={ledger?.length ?? 0} />
          {!ledger?.length ? (
            <Empty text="ยังไม่มีประวัติแต้ม" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {ledger.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800">{KIND_LABEL[l.kind] ?? l.kind}</p>
                    <p className="text-xs text-gray-400">
                      {formatThaiDate(l.created_at)} · {l.source_type}
                    </p>
                    {l.note && <p className="truncate text-[11px] text-gray-400">{l.note}</p>}
                  </div>
                  <span
                    className="shrink-0 text-sm font-semibold"
                    style={{ color: l.points > 0 ? 'var(--ht-success)' : 'var(--ht-error)' }}
                  >
                    {l.points > 0 ? '+' : ''}
                    {l.points.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">ความยินยอม (PDPA)</h2>
        {!consents?.length ? (
          <p className="text-sm text-gray-400">ไม่มีบันทึกความยินยอม</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {consents.map((c, i) => (
              <Tag
                key={i}
                text={`${c.kind}: ${c.granted ? 'ยินยอม' : 'ถอน'} (${c.source})`}
                color={c.granted ? 'var(--ht-success)' : 'var(--ht-error)'}
                bg={c.granted ? 'var(--ht-success-bg)' : '#fdecea'}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <span className="text-xs text-gray-400">{count} รายการ</span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-sm text-gray-400">{text}</p>
}

function Tag({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color, background: bg }}>
      {text}
    </span>
  )
}

function RegStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'รอตรวจสอบ', color: 'var(--ht-returning)', bg: 'var(--ht-returning-bg)' },
    active: { label: 'ประกันมีผล', color: 'var(--ht-success)', bg: 'var(--ht-success-bg)' },
    rejected: { label: 'ปฏิเสธ', color: 'var(--ht-error)', bg: '#fdecea' },
    attempts_exhausted: { label: 'ยื่นครบแล้ว', color: 'var(--ht-error)', bg: '#fdecea' },
    void: { label: 'ยกเลิก', color: '#6b7280', bg: '#f3f4f6' },
  }
  const m = map[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return <Tag text={m.label} color={m.color} bg={m.bg} />
}
