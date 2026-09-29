import Image from 'next/image'
import { mediaUrl, type Bubble } from '@/lib/campaigns/messages'

/** Linkify for the preview only -- LINE itself underlines URLs the same way. */
function withLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s<>"'()฀-๿]*[^\s<>"'().,!?;:฀-๿])/gi)
  return parts.map((p, i) =>
    i % 2 ? (
      <span key={i} className="break-all text-[#2a5bd7] underline">
        {p}
      </span>
    ) : (
      p
    )
  )
}

/**
 * Phone-sized mock of the LINE chat, so the composer shows what the
 * customer will see: the OA avatar, then each bubble in order.
 */
export function LinePreview({ bubbles, supabaseUrl }: { bubbles: Bubble[]; supabaseUrl: string }) {
  return (
    <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[28px] border-[6px] border-[#1f1f1f] bg-[#1f1f1f] shadow-lg">
      <div className="flex items-center gap-2 bg-[#2b3a55] px-3 py-2.5 text-white">
        <span className="text-xs opacity-70">‹</span>
        <span className="flex-1 truncate text-sm font-semibold">Hosttail</span>
        <span className="text-[10px] opacity-60">LINE</span>
      </div>
      <div className="flex min-h-[420px] flex-col gap-2 overflow-y-auto bg-[#8cabd9] px-2.5 py-3" style={{ maxHeight: 560 }}>
        {!bubbles.length && <p className="mt-24 text-center text-xs text-white/80">ตัวอย่างข้อความจะแสดงที่นี่</p>}
        {bubbles.map((b, i) => (
          <div key={i} className="flex items-start gap-1.5">
            {i === 0 ? (
              <Image src="/logo.png" alt="" width={30} height={30} className="h-[30px] w-[30px] shrink-0 rounded-full bg-white object-cover" />
            ) : (
              <span className="w-[30px] shrink-0" />
            )}
            <div className="min-w-0 max-w-[78%]">
              {i === 0 && <p className="mb-0.5 text-[10px] text-white/90">Hosttail</p>}
              {b.type === 'text' ? (
                <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap text-[#111] [overflow-wrap:anywhere]">
                  {b.text ? withLinks(b.text) : <span className="text-gray-400">(ข้อความว่าง)</span>}
                </div>
              ) : b.previewPath ? (
                // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, already sized
                <img
                  src={mediaUrl(supabaseUrl, b.previewPath)}
                  alt=""
                  className="block max-h-[320px] w-auto max-w-full rounded-2xl object-cover"
                  style={{ aspectRatio: `${b.width} / ${b.height}` }}
                />
              ) : (
                <div className="flex h-32 w-44 items-center justify-center rounded-2xl bg-white/60 text-xs text-gray-500">รูปภาพ</div>
              )}
              {b.type === 'image' && b.linkUrl && <p className="mt-0.5 truncate text-[10px] text-white/90">แตะรูป → {b.linkUrl}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
