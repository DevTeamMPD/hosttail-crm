import type { Metadata } from 'next'
import Image from 'next/image'
import { RegisterClient } from './register-client'

export const metadata: Metadata = {
  title: 'ลงทะเบียนรับประกันสินค้า — Hosttail',
}

export default function RegisterPage() {
  return (
    <>
      <header
        className="flex flex-col items-center gap-2 px-4 pt-8 pb-6 text-center text-white"
        style={{ background: 'linear-gradient(135deg, var(--ht-primary) 0%, var(--ht-deep) 100%)' }}
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-md">
          <Image src="/logo.png" alt="Hosttail" width={80} height={80} className="rounded-full" priority />
        </div>
        <p className="text-xs tracking-[4px] opacity-90">PET VARIETY STORE</p>
        <span className="mt-1 rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium">
          🛡️ ลงทะเบียนรับประกันสินค้า
        </span>
      </header>
      <RegisterClient />
    </>
  )
}
