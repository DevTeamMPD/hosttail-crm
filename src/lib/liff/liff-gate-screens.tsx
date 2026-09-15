'use client'

export function LiffLoadingScreen() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6 text-center">
      <div className="space-y-3">
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[var(--ht-primary)] border-t-transparent"
          role="status"
          aria-label="กำลังโหลด"
        />
        <p className="text-sm text-gray-500">กำลังเชื่อมต่อ LINE...</p>
      </div>
    </div>
  )
}

export function LiffErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6 text-center">
      <div className="w-full max-w-xs space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-base font-medium" style={{ color: 'var(--ht-error)' }}>
          {message}
        </p>
        <a
          href="https://line.me/R/ti/p/@hosttail"
          className="inline-block w-full rounded-full px-5 py-2.5 text-sm font-medium text-white"
          style={{ background: 'var(--ht-line)' }}
        >
          เปิด LINE OA @hosttail
        </a>
        <button
          type="button"
          onClick={onRetry}
          className="block w-full text-sm text-gray-500 underline underline-offset-2"
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    </div>
  )
}
