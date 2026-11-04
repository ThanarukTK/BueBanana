'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

  return <main className="flex min-h-screen items-center justify-center bg-[#f7f8f4] px-4 py-10">
    <section className="w-full max-w-md rounded-3xl border border-[#e6e9e1] bg-white p-7 shadow-sm sm:p-9">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#315b43] text-2xl">🍌</div>
      <p className="mt-6 text-xs font-semibold tracking-[.15em] text-[#63806b]">BUE BANANA · STAFF</p>
      <h1 className="mt-2 text-2xl font-semibold">เข้าสู่ระบบพนักงาน</h1>
      <p className="mt-2 text-sm leading-6 text-[#7e857b]">ใช้บัญชีพนักงานที่ผู้ดูแลระบบสร้างให้</p>

      <form onSubmit={(event) => void submit(event)} className="mt-7 space-y-4">
        <label className="block text-sm font-medium">ชื่อผู้ใช้
          <input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#dfe4dc] px-3 outline-none focus:border-[#829b83]" />
        </label>
        <label className="block text-sm font-medium">รหัสผ่าน
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#dfe4dc] px-3 outline-none focus:border-[#829b83]" />
        </label>
        {error && <p role="alert" className="rounded-xl border border-[#f0d0cc] bg-[#fff5f3] px-3 py-2.5 text-sm text-[#984e44]">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-xl bg-[#315b43] text-sm font-semibold text-white hover:bg-[#244833] disabled:opacity-60">{busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}</button>
      </form>
      <p className="mt-5 text-[11px] leading-5 text-[#898f85]">บัญชีและสิทธิ์การใช้งานตรวจสอบโดย Backend · ลูกค้าใช้บัตร NFC ไม่ต้องเข้าสู่ระบบ</p>
      <Link href="/customer" className="mt-5 block text-center text-xs font-semibold text-[#527251] hover:underline">กลับไปหน้าเว็บไซต์ลูกค้า</Link>
    </section>
  </main>;
}
