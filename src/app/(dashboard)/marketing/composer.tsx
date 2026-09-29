'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MAX_BUBBLES, MAX_TEXT, mediaUrl, type Bubble } from '@/lib/campaigns/messages'
import { LinePreview } from './line-preview'
import { ImagePicker } from './image-picker'
import {
  deleteCampaign,
  previewAudience,
  saveCampaign,
  sendTestCampaign,
  startCampaign,
  type ActionResult,
} from './actions'

interface Props {
  campaign: { id: string | null; name: string; segmentId: string; bubbles: Bubble[] }
  segments: { id: string; name: string; manual: boolean }[]
  testMembers: { id: string; name: string }[]
  supabaseUrl: string
  dryRun: boolean
}

type Audience = Awaited<ReturnType<typeof previewAudience>>

/**
 * Campaign editor, modelled on LINE OA Manager's broadcast screen: pick a
 * customer group, stack up to 5 text/image bubbles, see the phone preview,
 * send a test, then send.
 */
export function Composer({ campaign, segments, testMembers, supabaseUrl, dryRun }: Props) {
  const router = useRouter()
  const [id, setId] = useState(campaign.id)
  const [name, setName] = useState(campaign.name)
  const [segmentId, setSegmentId] = useState(campaign.segmentId)
  const [bubbles, setBubbles] = useState<Bubble[]>(campaign.bubbles.length ? campaign.bubbles : [{ type: 'text', text: '' }])
  const [audience, setAudience] = useState<Audience | null>(null)
  const [testTo, setTestTo] = useState(testMembers[0]?.id ?? '')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [busy, startTransition] = useTransition()

  useEffect(() => {
    if (!segmentId) return
    let live = true
    previewAudience(segmentId).then((a) => live && setAudience(a))
    return () => {
      live = false
    }
  }, [segmentId])

  const update = (i: number, b: Bubble) => setBubbles((prev) => prev.map((x, j) => (j === i ? b : x)))
  const move = (i: number, d: -1 | 1) =>
    setBubbles((prev) => {
      const next = [...prev]
      ;[next[i], next[i + d]] = [next[i + d], next[i]]
      return next
    })
  const remove = (i: number) => setBubbles((prev) => prev.filter((_, j) => j !== i))

  // Empty text boxes and image boxes with no file yet are left out, not errors.
  const ready = bubbles.filter((b) => (b.type === 'text' ? b.text.trim() : b.path))
  const input = () => ({ id, name, segmentId, bubbles: ready })

  async function save(): Promise<string | null> {
    const res = await saveCampaign(input())
    setResult(res)
    if (!res.ok) return null
    if (!id) {
      setId(res.id)
      window.history.replaceState(null, '', `/marketing/${res.id}`)
    }
    return res.id
  }

  const reachable = audience?.ok ? audience.reachable : 0

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">ชื่อแคมเปญ (ลูกค้าไม่เห็น)</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น โปรปลายเดือน ต.ค. — คนเลี้ยงแมว" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">ส่งถึงกลุ่มลูกค้า</span>
            <select
              value={segmentId}
              onChange={(e) => {
                setSegmentId(e.target.value)
                setAudience(null)
              }}
              className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm"
            >
              <option value="">— เลือกกลุ่ม —</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.manual ? '👥 ' : ''}
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {!segments.length && (
            <p className="text-xs text-gray-500">ยังไม่มีกลุ่มลูกค้า — สร้างได้ที่หน้า “ลูกค้า” (บันทึกตัวกรอง หรือเลือกลูกค้าเข้ากลุ่ม)</p>
          )}
          {segmentId && (
            <p className="rounded-lg bg-[var(--ht-bg-to)] px-3 py-2 text-xs text-gray-700">
              {!audience ? (
                'กำลังนับผู้รับ...'
              ) : audience.ok ? (
                <>
                  ส่งถึงได้ <b className="text-sm text-[var(--ht-deep)]">{audience.reachable.toLocaleString()}</b> คน จากในกลุ่ม{' '}
                  {audience.total.toLocaleString()} คน
                  {audience.noLine + audience.unfollowed + audience.optedOut > 0 && (
                    <span className="text-gray-500">
                      {' '}
                      (ไม่มี LINE {audience.noLine} · เลิกติดตาม OA {audience.unfollowed} · ขอไม่รับข่าวสาร {audience.optedOut})
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[var(--ht-error)]">{audience.message}</span>
              )}
            </p>
          )}
        </section>

        {bubbles.map((b, i) => (
          <section key={i} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-ht-mono rounded bg-[var(--ht-brown)] px-1.5 text-[11px] text-white">{i + 1}</span>
              <span className="text-sm font-medium text-gray-800">{b.type === 'text' ? 'ข้อความ' : 'รูปภาพ'}</span>
              <span className="ml-auto flex gap-1">
                <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น">
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === bubbles.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="เลื่อนลง"
                >
                  ↓
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} aria-label="ลบกล่องนี้">
                  ×
                </Button>
              </span>
            </div>

            {b.type === 'text' ? (
              <>
                <Textarea
                  value={b.text}
                  maxLength={MAX_TEXT}
                  onChange={(e) => update(i, { type: 'text', text: e.target.value })}
                  placeholder={'พิมพ์ข้อความ... ใส่ลิงก์ได้ เช่น https://hosttail.com/sale\nระบบจะนับว่าลูกค้าคนไหนกดลิงก์'}
                  className="min-h-28"
                />
                <p className="mt-1 text-right text-[11px] text-gray-400">
                  {b.text.length.toLocaleString()} / {MAX_TEXT.toLocaleString()}
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  {b.previewPath && (
                    // eslint-disable-next-line @next/next/no-img-element -- public Storage URL
                    <img
                      src={mediaUrl(supabaseUrl, b.previewPath)}
                      alt=""
                      className="h-24 w-24 rounded-lg border object-cover"
                    />
                  )}
                  <ImagePicker
                    label={b.path ? 'เปลี่ยนรูป' : 'เลือกรูป (JPG/PNG)'}
                    onUploaded={(img) => update(i, { ...b, ...img })}
                  />
                </div>
                <label className="block space-y-1">
                  <span className="text-xs text-gray-600">ลิงก์เมื่อแตะรูป (ไม่ใส่ก็ได้)</span>
                  <Input
                    value={b.linkUrl ?? ''}
                    onChange={(e) => update(i, { ...b, linkUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </label>
              </div>
            )}
          </section>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={bubbles.length >= MAX_BUBBLES}
            onClick={() => setBubbles((p) => [...p, { type: 'text', text: '' }])}
          >
            + ข้อความ
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={bubbles.length >= MAX_BUBBLES}
            onClick={() => setBubbles((p) => [...p, { type: 'image', path: '', previewPath: '', width: 1, height: 1, linkUrl: '' }])}
          >
            + รูปภาพ
          </Button>
          <span className="text-xs text-gray-400">
            {bubbles.length}/{MAX_BUBBLES} กล่อง (เท่ากับ LINE OA)
          </span>
        </div>

        <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4">
          <Button type="button" variant="outline" disabled={busy} onClick={() => startTransition(async () => void (await save()))}>
            บันทึกร่าง
          </Button>

          <span className="mx-1 h-6 w-px bg-gray-200" />
          {testMembers.length ? (
            <>
              <select
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs"
                aria-label="บัญชีทดสอบ"
              >
                {testMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !testTo}
                onClick={() => startTransition(async () => setResult(await sendTestCampaign(input(), testTo)))}
              >
                ส่งทดสอบ
              </Button>
            </>
          ) : (
            <span className="text-xs text-gray-400">ส่งทดสอบได้เมื่อมีบัญชีทดสอบ (scripts/test-member.ts)</span>
          )}

          <span className="ml-auto flex gap-2">
            {id && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!confirm('ลบแคมเปญร่างนี้?')) return
                  startTransition(async () => {
                    const res = await deleteCampaign(id)
                    setResult(res)
                    if (res.ok) router.push('/marketing')
                  })
                }}
              >
                ลบร่าง
              </Button>
            )}
            <Button
              type="button"
              disabled={busy || !segmentId || !reachable}
              className="text-white"
              style={{ background: 'var(--ht-line)' }}
              onClick={() => {
                const what = dryRun ? '(โหมดทดลอง — ยังไม่ส่งถึงลูกค้าจริง)' : 'ส่งแล้วแก้ไขหรือยกเลิกไม่ได้'
                if (!confirm(`ส่งแคมเปญ "${name || 'ไม่มีชื่อ'}" ถึง ${reachable.toLocaleString()} คน?\n${what}`)) return
                startTransition(async () => {
                  const saved = await save()
                  if (!saved) return
                  const res = await startCampaign(saved)
                  setResult(res)
                  if (res.ok) router.push(`/marketing/${saved}?go=1`)
                })
              }}
            >
              {busy ? 'กำลังดำเนินการ...' : `ส่ง LINE ${reachable ? `(${reachable.toLocaleString()} คน)` : ''}`}
            </Button>
          </span>
          {result && (
            <p className="w-full text-xs" style={{ color: result.ok ? 'var(--ht-success)' : 'var(--ht-error)' }}>
              {result.message}
            </p>
          )}
        </section>
      </div>

      <aside className="space-y-2 xl:sticky xl:top-6 xl:self-start">
        <p className="text-center text-xs text-gray-500">ตัวอย่างบนมือถือลูกค้า</p>
        <LinePreview bubbles={ready} supabaseUrl={supabaseUrl} />
      </aside>
    </div>
  )
}
