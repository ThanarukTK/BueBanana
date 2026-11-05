'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../theme-toggle';

type LoginResponse = { data?: { staff?: { displayName: string; role: 'staff' | 'admin' } }; error?: { message?: string } };

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json() as LoginResponse;
      if (!response.ok) throw new Error(result.error?.message ?? 'เข้าสู่ระบบไม่สำเร็จ');
      router.replace('/');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return <main className="relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10">
    <div className="absolute right-5 top-5"><ThemeToggle /></div>
    <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-sm sm:p-9">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-2xl">🍌</div>
      <p className="mt-6 text-xs font-semibold tracking-[.15em] text-[var(--text-muted)]">BUE BANANA · STAFF</p>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--text-strong)]">เข้าสู่ระบบพนักงาน</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">ใช้บัญชีพนักงานที่ผู้ดูแลระบบสร้างให้</p>

      <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-4">
        <label className="block text-sm font-medium text-[var(--text)]">ชื่อผู้ใช้
          <input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[var(--border-2)] bg-[var(--surface)] px-3 text-[var(--text)] outline-none focus:border-[var(--accent)]" />
        </label>
        <label className="block text-sm font-medium text-[var(--text)]">รหัสผ่าน
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[var(--border-2)] bg-[var(--surface)] px-3 text-[var(--text)] outline-none focus:border-[var(--accent)]" />
        </label>
        {error && <p role="alert" className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2.5 text-sm text-[var(--danger-ink)]">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-xl bg-[var(--accent)] text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-60">{busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}</button>
      </form>
      <p className="mt-5 text-[11px] leading-5 text-[var(--text-faint)]">บัญชีและสิทธิ์การใช้งานตรวจสอบโดย Backend · ลูกค้าใช้บัตร NFC ไม่ต้องเข้าสู่ระบบ</p>
      <Link href="/customer" className="mt-5 block text-center text-xs font-semibold text-[var(--accent)] hover:underline">กลับไปหน้าเว็บไซต์ลูกค้า</Link>
    </section>
  </main>;
}
