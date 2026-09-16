'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.message ?? 'เข้าสู่ระบบไม่สำเร็จ')
        return
      }
      // Full navigation, not router.push: the layout above needs to re-read
      // the freshly set auth cookies on the server.
      const next = new URLSearchParams(window.location.search).get('next')
      window.location.href = next && next.startsWith('/') ? next : '/overview'
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="email">อีเมล</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
          placeholder="you@mpdgroup.co"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      {error && (
        <p className="rounded-lg px-3 py-2 text-center text-sm" style={{ background: '#fdecea', color: 'var(--ht-error)' }}>
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="w-full text-white"
        style={{ background: 'linear-gradient(135deg, var(--ht-primary), var(--ht-deep))' }}
      >
        {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
      </Button>
    </form>
  )
}
