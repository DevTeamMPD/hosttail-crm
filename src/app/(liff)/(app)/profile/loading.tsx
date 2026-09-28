import { CARD_SHADOW, Skeleton } from '../../ui'

/** Shown instantly on tab switch while the server renders the profile page. */
export default function ProfileLoading() {
  return (
    <div className="flex flex-col gap-3 px-3.5 pt-8 pb-24" role="status" aria-label="กำลังโหลด">
      <h1 className="px-1 text-[22px] font-semibold text-[var(--ht-ink)]">ข้อมูลสมาชิก</h1>
      <div className="flex flex-col gap-4 rounded-[20px] bg-white px-[18px] py-4" style={{ boxShadow: CARD_SHADOW }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-[20px] bg-white p-[18px]" style={{ boxShadow: CARD_SHADOW }}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          {[64, 56, 72, 48, 80].map((w, i) => (
            <Skeleton key={i} className="h-10 rounded-full" style={{ width: w }} />
          ))}
        </div>
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  )
}
