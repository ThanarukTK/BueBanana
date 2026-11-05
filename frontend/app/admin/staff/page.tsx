'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../../theme-toggle';

type StaffAccount = { staffId: string; username: string; displayName: string; role: 'staff' | 'admin'; status: 'active' | 'disabled'; createdAt: string };
type Envelope = { data?: { staff?: StaffAccount | StaffAccount[] }; error?: { message?: string } };

export default function StaffManagementPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ staffId: string; displayName: string; role: 'staff' | 'admin' } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');

  async function loadAccounts() {
    setLoading(true);
    try {
      const response = await fetch('/api/backend/api/v1/staff', { cache: 'no-store' });
      const result = await response.json() as Envelope;
      if (!response.ok) throw new Error(result.error?.message ?? 'โหลดบัญชีพนักงานไม่สำเร็จ');
      setAccounts(Array.isArray(result.data?.staff) ? result.data.staff : []);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'โหลดบัญชีพนักงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const initial = window.setTimeout(async () => {
      const previewRequested = process.env.NODE_ENV !== 'production'
        && new URLSearchParams(window.location.search).get('preview') === 'admin';
      if (previewRequested) {
        setPreviewMode(true);
        setMe({ staffId: 'preview-admin', displayName: 'Preview Admin', role: 'admin' });
        setLoading(false);
        return;
      }
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        const result = await response.json() as { data?: { staff?: { staffId: string; displayName: string; role: 'staff' | 'admin' } } };
        if (!response.ok || !result.data?.staff) {
          router.replace('/login');
          return;
        }
        if (cancelled) return;
        setMe(result.data.staff);
        if (result.data.staff.role === 'admin') await loadAccounts();
      } catch {
        if (!cancelled) router.replace('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(initial); };
  }, [router]);

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || previewMode) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/backend/api/v1/staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, displayName, password, role }),
      });
      const result = await response.json() as Envelope;
      if (!response.ok) throw new Error(result.error?.message ?? 'สร้างบัญชีไม่สำเร็จ');
      setUsername(''); setDisplayName(''); setPassword(''); setRole('staff');
      setNotice('สร้างบัญชีพนักงานแล้ว');
      await loadAccounts();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'สร้างบัญชีไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function updateAccount(account: StaffAccount, update: Partial<Pick<StaffAccount, 'role' | 'status'>>) {
    if (previewMode) return;
    setError(''); setNotice('');
    try {
      const response = await fetch(`/api/backend/api/v1/staff/${encodeURIComponent(account.staffId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
      });
      const result = await response.json() as Envelope;
      if (!response.ok) {
        setError(result.error?.message ?? 'บันทึกสิทธิ์ไม่สำเร็จ');
        return;
      }
      setNotice('บันทึกบัญชีแล้ว');
      await loadAccounts();
    } catch {
      setError('ติดต่อ Backend ไม่ได้');
    }
  }

  if (loading || !me) return <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-sm text-[var(--text-muted)]">กำลังตรวจสอบสิทธิ์…</main>;
  if (me.role !== 'admin') return <main className="mx-auto max-w-lg px-5 py-20 text-center"><h1 className="text-xl font-semibold">ไม่มีสิทธิ์เข้าถึง</h1><p className="mt-2 text-sm text-[var(--text-muted)]">หน้านี้สำหรับผู้ดูแลระบบ</p><Link href="/" className="mt-5 inline-block text-sm font-semibold text-[var(--accent)]">กลับหน้าปฏิบัติงาน</Link></main>;

  return <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
    {previewMode && <div role="status" className="bg-[var(--warn-bg)] px-4 py-2 text-center text-xs font-medium text-[var(--warn-ink)]">โหมด Preview · ดูหน้าจอได้ แต่การสร้างหรือแก้บัญชีถูกปิดไว้</div>}
    <header className="border-b border-[var(--border)] bg-[var(--surface)]"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><div><Link href="/" className="text-xs font-semibold text-[var(--accent)]">← กลับหน้าปฏิบัติงาน</Link><h1 className="mt-2 text-xl font-semibold text-[var(--text-strong)]">จัดการบัญชีพนักงาน</h1></div><div className="flex items-center gap-3"><span className="text-xs text-[var(--text-muted)]">{me.displayName} · Admin</span><ThemeToggle /></div></div></header>
    <div className="mx-auto grid max-w-6xl gap-5 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">บัญชีและสิทธิ์</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Admin จัดการบัญชีได้ · Staff ใช้หน้าปฏิบัติงาน</p></div><button disabled={previewMode} onClick={() => void loadAccounts()} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium disabled:opacity-50">โหลดใหม่</button></div>
        {loading ? <p className="py-12 text-center text-sm text-[var(--text-muted)]">กำลังโหลด…</p> : accounts.length === 0 ? <p className="py-12 text-center text-sm text-[var(--text-muted)]">ยังไม่มีบัญชีพนักงาน</p> : <ul className="mt-4 divide-y divide-[var(--border)]">{accounts.map((account) => <li key={account.staffId} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold">{account.displayName} <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">@{account.username}</span></p><p className="mt-1 text-[11px] text-[var(--text-muted)]">{account.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'} · {account.role === 'admin' ? 'Admin' : 'Staff'}</p></div><div className="flex items-center gap-2"><select value={account.role} onChange={(event) => void updateAccount(account, { role: event.target.value as 'staff' | 'admin' })} aria-label={`สิทธิ์ ${account.username}`} className="h-9 rounded-lg border border-[var(--border-2)] bg-[var(--surface)] px-2 text-xs"><option value="staff">Staff</option><option value="admin">Admin</option></select><button disabled={account.staffId === me.staffId || account.status === 'disabled'} onClick={() => void updateAccount(account, { status: 'disabled' })} className="h-9 rounded-lg border border-[var(--danger-border)] px-3 text-xs font-medium text-[var(--danger-ink)] disabled:opacity-40">ปิดบัญชี</button></div></li>)}</ul>}
      </section>

      <section className="h-fit rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <h2 className="font-semibold">สร้างบัญชี</h2>
        <p className="mt-2 rounded-xl bg-[var(--surface-2)] p-3 text-[11px] leading-5 text-[var(--text-muted)]">แจ้งพนักงานก่อนเก็บข้อมูล: ชื่อผู้ใช้และชื่อแสดงใช้สำหรับเข้าสู่ระบบ กำหนดสิทธิ์ และบันทึก Audit log เท่านั้น</p>
        <form onSubmit={(event) => void createStaff(event)} className="mt-4 space-y-3">
          <label className="block text-xs font-medium">ชื่อผู้ใช้<input disabled={previewMode} required minLength={3} maxLength={80} value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-2)] px-3 text-sm disabled:bg-[var(--surface-2)]" /></label>
          <label className="block text-xs font-medium">ชื่อแสดง<input disabled={previewMode} required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-2)] px-3 text-sm disabled:bg-[var(--surface-2)]" /></label>
          <label className="block text-xs font-medium">รหัสผ่านเริ่มต้น<input disabled={previewMode} required minLength={12} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-2)] px-3 text-sm disabled:bg-[var(--surface-2)]" /><span className="mt-1 block text-[10px] font-normal text-[var(--text-muted)]">อย่างน้อย 12 ตัวอักษร</span></label>
          <label className="block text-xs font-medium">สิทธิ์<select disabled={previewMode} value={role} onChange={(event) => setRole(event.target.value as 'staff' | 'admin')} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border-2)] bg-[var(--surface)] px-3 text-sm disabled:bg-[var(--surface-2)]"><option value="staff">Staff · งานหน้าร้าน</option><option value="admin">Admin · จัดการบัญชี</option></select></label>
          {error && <p role="alert" className="rounded-lg bg-[var(--danger-bg)] p-2.5 text-xs text-[var(--danger-ink)]">{error}</p>}
          {notice && <p role="status" className="rounded-lg bg-[var(--surface-2)] p-2.5 text-xs text-[var(--accent)]">{notice}</p>}
          <button disabled={busy || previewMode} className="h-10 w-full rounded-lg bg-[var(--accent)] text-xs font-semibold text-[var(--accent-ink)] disabled:opacity-60">{previewMode ? 'Preview เท่านั้น' : busy ? 'กำลังสร้าง…' : 'สร้างบัญชีพนักงาน'}</button>
        </form>
      </section>
    </div>
  </main>;
}
