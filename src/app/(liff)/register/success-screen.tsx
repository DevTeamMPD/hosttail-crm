'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { isInLineClient, closeLiffWindow } from '@/lib/liff/client'

interface Props {
  message: string
  status: 'active' | 'pending'
}

/**
 * No more auto-close: with the bottom-nav app shell (/home, /profile,
 * /warranty, /privileges) there's now somewhere useful to land after
 * submitting, so the customer picks where to go instead of the window
 * closing itself out from under them 3 seconds later.
 */
export function SuccessScreen({ message, status }: Props) {
  const router = useRouter()

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-6xl" aria-hidden>
        {status === 'active' ? '🎉' : '⏳'}
      </div>
      <h2 className="text-lg font-semibold text-gray-900">
        {status === 'active' ? 'ลงทะเบียนรับประกันสำเร็จ!' : 'ได้รับเรื่องแล้ว'}
      </h2>
      <p className="max-w-xs text-sm text-gray-500">{message}</p>
      {status === 'active' && (
        <span
          className="rounded-full px-4 py-1.5 text-sm font-medium"
          style={{ background: 'var(--ht-success-bg)', color: 'var(--ht-success)' }}
        >
          ✅ ประกันมีผลแล้ว
        </span>
      )}

      <div className="mt-2 w-full max-w-xs space-y-2">
        <Button
          type="button"
          onClick={() => router.push('/home')}
          className="w-full text-white"
          style={{ background: 'linear-gradient(135deg, var(--ht-primary), var(--ht-deep))' }}
        >
          ไปที่หน้าหลัก
        </Button>
        {isInLineClient() && (
          <button
            type="button"
            onClick={closeLiffWindow}
            className="block w-full text-sm text-gray-500 underline underline-offset-2"
          >
            ปิดหน้าต่างนี้
          </button>
        )}
      </div>
    </div>
  )
}
