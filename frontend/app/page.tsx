'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Member = {
  tagId: string;
  label: string | null;
  sessionId: string;
  checkInTime: string;
  amountSatang: number;
};
type Group = {
  groupId: string;
  status: 'active' | 'closed';
  startTime: string;
  tags: Member[];
  amountSatang: number;
};
type ApiEnvelope = {
  data?: Group[];
  reader?: {
    activeCount: number;
    activePlayers: number;
    currentBillSatang: number;
    billedSatang: number;
    openGroupId: string | null;
    openUntil: string | null;
    ratePerHour: number;
  };
  error?: { code?: string; message?: string; details?: { amount?: number } };
};
type ScanActivity = {
  groupId: string;
  scanningTagId: string;
  sessionId: string;
  at: string;
};
type Activity = { id: string; message: string; at: string };
type BackendState = 'connecting' | 'connected' | 'offline';
type RealtimeState = 'connecting' | 'connected' | 'offline';
type StaffProfile = { staffId: string; username: string; displayName: string; role: 'staff' | 'admin' };
type CheckoutTarget = { group: Group; member?: Member };

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<string, React.ReactNode> = {
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>,
    groups: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10m6-10v10"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18m-14 5h4"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    close: <path d="m18 6-12 12M6 6l12 12"/>,
  };
  return <svg {...common} aria-hidden="true">{paths[name] ?? paths.groups}</svg>;
}

function money(satang: number) {
  return `฿${(satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
}
function time(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
}
function duration(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  return minutes < 60 ? `${minutes} นาที` : `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
}

export default function Home() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const groupsRef = useRef<Group[]>([]);
  const [reader, setReader] = useState<ApiEnvelope['reader']>();
  const [backendState, setBackendState] = useState<BackendState>('connecting');
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('connecting');
  const [loadError, setLoadError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [scan, setScan] = useState<ScanActivity | null>(null);
  const [pendingScanFocus, setPendingScanFocus] = useState<ScanActivity | null>(null);
  const [checkoutScan, setCheckoutScan] = useState<{ groupId: string; sessionId: string } | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);
  const [checkoutConfirmed, setCheckoutConfirmed] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [activity, setActivity] = useState<Activity[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    const check = window.setTimeout(async () => {
      const previewRole = process.env.NODE_ENV !== 'production'
        ? new URLSearchParams(window.location.search).get('preview')
        : null;
      if (previewRole === 'staff' || previewRole === 'admin') {
        setPreviewMode(true);
        setStaff({
          staffId: `preview-${previewRole}`,
          username: `preview-${previewRole}`,
          displayName: `Preview ${previewRole === 'admin' ? 'Admin' : 'Staff'}`,
          role: previewRole,
        });
        setBackendState('offline');
        setRealtimeState('offline');
        setLoadError('โหมด Preview แสดงเฉพาะหน้าจอและไม่เชื่อมต่อข้อมูลจริง');
        setAuthChecked(true);
        return;
      }
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        const result = await response.json() as { data?: { staff?: StaffProfile } };
        if (!cancelled && response.ok && result.data?.staff) setStaff(result.data.staff);
        else if (!cancelled) router.replace('/login');
      } catch {
        if (!cancelled) router.replace('/login');
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(check); };
  }, [router]);

  const refresh = useCallback(async (): Promise<Group[] | null> => {
    if (previewMode) {
      setBackendState('offline');
      setLoadError('โหมด Preview แสดงเฉพาะหน้าจอและไม่เชื่อมต่อข้อมูลจริง');
      return null;
    }
    try {
      const response = await fetch('/api/backend/api/v1/groups?status=active', { cache: 'no-store' });
      const result = await response.json() as ApiEnvelope;
      if (!response.ok) throw new Error(result.error?.message ?? 'โหลดข้อมูลจาก Backend ไม่สำเร็จ');
      if (!Array.isArray(result.data)) throw new Error('รูปแบบข้อมูลกลุ่มจาก Backend ไม่ถูกต้อง');
      groupsRef.current = result.data;
      setGroups(result.data);
      setReader(result.reader);
      setBackendState('connected');
      setLoadError('');
      setUpdatedAt(new Date().toISOString());
      return result.data;
    } catch (error) {
      setBackendState('offline');
      setLoadError(error instanceof Error ? error.message : 'เชื่อมต่อ Backend ไม่ได้');
      return null;
    }
  }, [previewMode]);

  useEffect(() => {
    if (!staff || previewMode) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => void refresh(), 8_000);
    return () => { window.clearTimeout(initial); window.clearInterval(poll); };
  }, [previewMode, refresh, staff]);

  useEffect(() => {
    if (!staff || previewMode) return;
    const source = new EventSource('/api/events');
    source.onopen = () => setRealtimeState('connected');
    source.onerror = () => setRealtimeState('offline');
    source.addEventListener('upstream-error', () => setRealtimeState('offline'));
    source.onmessage = (message) => {
      let event: { event?: string; data?: Record<string, unknown>; ts?: string };
      try { event = JSON.parse(message.data) as typeof event; } catch { return; }
      const at = event.ts ?? new Date().toISOString();

      if (event.event === 'scan.activity') {
        const data = event.data ?? {};
        const nextScan = {
          groupId: String(data.groupId ?? ''),
          scanningTagId: String(data.scanningTagId ?? ''),
          sessionId: String(data.sessionId ?? ''),
          at,
        };
        setScan(nextScan);
        setPendingScanFocus(nextScan);
        setFilter('');
        const scannedGroup = groupsRef.current.find((group) => group.groupId === nextScan.groupId);
        const existingMember = scannedGroup?.tags.find((member) =>
          member.sessionId === nextScan.sessionId || member.tagId === nextScan.scanningTagId,
        );
        setCheckoutScan(existingMember ? { groupId: nextScan.groupId, sessionId: existingMember.sessionId } : null);
        setCheckoutTarget(null);
        setCheckoutConfirmed(false);
        addActivity(`มีการแตะบัตร · กลุ่ม ${String(data.groupId ?? '')}`, at);
        void refresh();
      } else if (event.event === 'group.updated') {
        const data = event.data ?? {};
        addActivity(`ข้อมูลกลุ่ม ${String(data.groupId ?? '')} เปลี่ยนแปลง`, at);
        void refresh();
      } else if (event.event === 'session.closed') {
        const data = event.data ?? {};
        const sessionId = String(data.sessionId ?? '');
        setScan((current) => current?.sessionId === sessionId ? null : current);
        setCheckoutScan((current) => current?.sessionId === sessionId ? null : current);
        addActivity(`เช็กเอาต์สมาชิกแล้ว · กลุ่ม ${String(data.groupId ?? '')}`, at);
        void refresh();
      }
    };
    return () => source.close();
  }, [previewMode, refresh, staff]);

  function addActivity(message: string, at: string) {
    setActivity((current) => [{ id: `${at}-${message}-${Math.random()}`, message, at }, ...current].slice(0, 8));
  }

  const activeGroups = useMemo(() => groups
    .filter((group) => group.status === 'active')
    .filter((group) => `${group.groupId} ${group.tags.map((member) => `${member.label ?? ''} ${member.tagId}`).join(' ')}`.toLowerCase().includes(filter.toLowerCase())), [groups, filter]);
  const activeScan = scan && Date.now() - Date.parse(scan.at) < 30_000 ? scan : null;
  const scanningMember = activeScan && groups.find((group) => group.groupId === activeScan.groupId)?.tags.find((member) => member.sessionId === activeScan.sessionId);

  useEffect(() => {
    if (!pendingScanFocus) return;
    const member = document.getElementById(`member-${pendingScanFocus.sessionId}`);
    if (!member) return;
    member.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPendingScanFocus(null);
  }, [activeGroups, pendingScanFocus]);

  function openCheckout(group: Group, member?: Member) {
    setCheckoutTarget({ group, member });
    setCheckoutConfirmed(false);
  }

  async function submitCheckout() {
    if (!checkoutTarget || !checkoutConfirmed || checkoutBusy) return;
    const target = checkoutTarget;
    const amount = target.member?.amountSatang ?? target.group.amountSatang;
    const endpoint = target.member
      ? `/api/backend/api/v1/sessions/${encodeURIComponent(target.member.sessionId)}/check-out`
      : `/api/backend/api/v1/groups/${encodeURIComponent(target.group.groupId)}/check-out`;
    setCheckoutBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, customerConfirmed: true }),
      });
      const result = await response.json() as ApiEnvelope;
      if (response.ok) {
        setCheckoutTarget(null);
        setCheckoutConfirmed(false);
        setCheckoutScan(null);
        setToast('บันทึกการเช็กเอาต์แล้ว');
        addActivity(`เช็กเอาต์สำเร็จ · ${target.member ? 'รายคน' : 'ทั้งกลุ่ม'} ${target.group.groupId}`, new Date().toISOString());
        await refresh();
      } else if (response.status === 409 && result.error?.code === 'BILL_AMOUNT_MISMATCH' && typeof result.error.details?.amount === 'number') {
        const expected = result.error.details.amount;
        setCheckoutTarget((current) => {
          if (!current) return current;
          if (!current.member) return { ...current, group: { ...current.group, amountSatang: expected } };
          const member = { ...current.member, amountSatang: expected };
          return { ...current, member, group: { ...current.group, tags: current.group.tags.map((entry) => entry.sessionId === member.sessionId ? member : entry) } };
        });
        setCheckoutConfirmed(false);
        setToast(`ยอดเปลี่ยนเป็น ${money(expected)} · ตรวจสอบกับลูกค้าแล้วกดยืนยันอีกครั้ง`);
        await refresh();
      } else {
        setToast(result.error?.message ?? 'เช็กเอาต์ไม่สำเร็จ · โหลดข้อมูลใหม่แล้วลองอีกครั้ง');
        await refresh();
      }
    } catch {
      setToast('เชื่อม Backend ไม่ได้ · ลองโหลดข้อมูลใหม่');
    } finally {
      setCheckoutBusy(false);
      window.setTimeout(() => setToast(''), 5_000);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  const realtimeLabel = realtimeState === 'connected' ? 'กิจกรรมสด' : realtimeState === 'connecting' ? 'กำลังเชื่อมกิจกรรม' : 'กิจกรรมสดขาดการเชื่อมต่อ';

  if (!authChecked || !staff) return <main className="flex min-h-screen items-center justify-center bg-[#0d1117] text-sm text-[#8b949e]">กำลังตรวจสอบบัญชีพนักงาน…</main>;

  return <main className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
    {previewMode && <div role="status" className="border-b border-[#3a2f14] bg-[#2c220b] px-4 py-2 text-center text-xs font-medium text-[#e8c766]">โหมด Preview · ไม่ได้เข้าสู่ระบบ · ไม่มีการโหลดข้อมูลจริง</div>}
    <header className="border-b border-[#21262d] bg-[#11161d]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#7140dd] to-[#3c55dd] text-xl shadow-lg shadow-[#7140dd]/25">🍌</div><div><p className="text-sm font-bold text-[#f0f6fc]">Bue Banana</p><p className="text-[10px] tracking-wide text-[#8b949e]">STAFF · NFC GROUP FLOW</p></div></div>
        <div className="flex items-center gap-3">
          <Status state={backendState} label={backendState === 'connected' ? 'Backend เชื่อมต่อ' : backendState === 'connecting' ? 'กำลังเชื่อม Backend' : 'Backend ขาดการเชื่อมต่อ'} />
          <Link href="/customer" className="hidden rounded-lg border border-[#30363d] px-3 py-2 text-xs font-semibold text-[#a5f3fc] hover:bg-[#161b22] sm:inline-flex">หน้าเว็บลูกค้า</Link>
          {staff.role === 'admin' && <a href="/admin/staff" className="hidden rounded-lg border border-[#30363d] px-3 py-2 text-xs font-semibold text-[#a5f3fc] hover:bg-[#161b22] sm:inline-flex">จัดการบัญชี</a>}
          <span className="hidden text-right sm:block"><span className="block text-xs font-semibold text-[#e6edf3]">{staff.displayName}</span><span className="text-[10px] text-[#8b949e]">{staff.role === 'admin' ? 'Admin' : 'Staff'}</span></span>
          <button onClick={() => void logout()} className="rounded-lg border border-[#30363d] px-3 py-2 text-xs font-semibold text-[#e6edf3] hover:bg-[#161b22]">ออกจากระบบ</button>
          <button onClick={() => void refresh()} aria-label="โหลดข้อมูลใหม่" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#30363d] text-[#e6edf3] hover:bg-[#161b22]"><Icon name="refresh" size={16} /></button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold tracking-[.15em] text-[#a78bfa]">STAFF VIEW</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#f0f6fc] sm:text-3xl">กลุ่มที่กำลังเล่น</h1><p className="mt-2 text-sm text-[#8b949e]">สแกนชิปเดิมเพื่อเปิดตัวเลือกเช็กเอาต์ · สแกนชิปใหม่เพื่อเพิ่มสมาชิกในกลุ่มที่เปิดไว้</p></div>
        {updatedAt && <p className="text-xs text-[#8b949e]">อัปเดต {time(updatedAt)}</p>}
      </div>

      {backendState === 'offline' && <div role="alert" className="mt-5 rounded-xl border border-[#4a3b1f] bg-[#241e0d] px-4 py-3 text-sm text-[#e6c15c]">{loadError || 'เชื่อมต่อ Backend ไม่ได้'} {!previewMode && <span className="block pt-1 text-xs text-[#a3966a]">ตรวจค่า API_BASE_URL และสถานะบัญชี Backend</span>}</div>}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="overflow-hidden rounded-2xl border border-[#21262d] bg-[#11161d] shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#21262d] px-5 py-4">
            <div><h2 className="font-semibold text-[#f0f6fc]">กลุ่มและสมาชิก</h2><p className="mt-1 text-xs text-[#8b949e]">ไม่มีการระบุหมายเลขโต๊ะในข้อมูล Backend</p></div>
            <label className="sr-only" htmlFor="group-filter">ค้นหากลุ่มหรือสมาชิก</label>
            <input id="group-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="ค้นหากลุ่มหรือสมาชิก" className="h-9 w-full rounded-lg border border-[#30363d] bg-[#0d1117] px-3 text-sm text-[#e6edf3] outline-none placeholder:text-[#6e7681] focus:border-[#a78bfa] sm:w-56" />
          </div>
          {backendState === 'connected' && activeGroups.length === 0
            ? <p className="px-5 py-14 text-center text-sm text-[#8b949e]">ไม่มีกลุ่มที่กำลังเล่น</p>
            : <div className="divide-y divide-[#21262d]">{activeGroups.map((group) => <GroupCard key={group.groupId} group={group} scan={activeScan?.groupId === group.groupId ? activeScan : null} showCheckoutActions={Boolean(activeScan && checkoutScan?.groupId === group.groupId && checkoutScan.sessionId === activeScan.sessionId)} onCheckout={openCheckout} />)}</div>}
          {backendState === 'connecting' && <p className="px-5 py-14 text-center text-sm text-[#8b949e]">กำลังโหลดกลุ่มจาก Backend…</p>}
          {backendState === 'offline' && groups.length === 0 && <p className="px-5 py-10 text-center text-sm text-[#8b949e]">ยังไม่มีข้อมูลกลุ่ม · ระบบไม่แสดงข้อมูลตัวอย่าง</p>}
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-[#21262d] bg-[#11161d] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold text-[#f0f6fc]">กำลังแตะบัตร</h2><p className="mt-1 text-xs text-[#8b949e]">สถานะจากเหตุการณ์สแกนล่าสุด</p></div><Status state={realtimeState} label={realtimeLabel} /></div>
            {activeScan
              ? <div className="mt-4 rounded-xl border border-[#2e3f52] bg-[#14202e] p-4"><p className="text-sm font-semibold text-[#7dd3fc]">{scanningMember?.label || `ชิป ${activeScan.scanningTagId.slice(-6)}`}</p><p className="mt-1 text-xs text-[#9fb3c8]">กลุ่ม {activeScan.groupId}</p><p className="mt-2 text-[11px] text-[#8b949e]">{checkoutScan?.sessionId === activeScan.sessionId ? 'สมาชิกเดิม · เลือกเช็กเอาต์จากปุ่มในกลุ่มได้' : 'สมาชิกใหม่ · เพิ่มเข้ากลุ่มแล้ว'} · {time(activeScan.at)}</p></div>
              : <p className="mt-4 rounded-xl bg-[#161b22] px-4 py-6 text-center text-sm text-[#8b949e]">ยังไม่มีการแตะบัตรใน 30 วินาทีล่าสุด</p>}
            <p className="mt-3 text-[11px] leading-5 text-[#8b949e]">สถานะนี้แสดงกลุ่มและสมาชิกจาก Backend ไม่ได้ระบุตำแหน่งโต๊ะ</p>
          </section>

          <section className="rounded-2xl border border-[#21262d] bg-[#11161d] p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold text-[#f0f6fc]">กิจกรรมจากระบบ</h2><p className="mt-1 text-xs text-[#8b949e]">รับจาก WebSocket /ws/admin</p></div><span className={`h-2 w-2 rounded-full ${realtimeState === 'connected' ? 'bg-[#4e9b65]' : 'bg-[#c59a36]'}`} /></div>
            {activity.length ? <ol className="mt-4 space-y-3">{activity.map((item) => <li key={item.id} className="flex gap-3 text-xs text-[#c9d1d9]"><time className="shrink-0 text-[#8b949e]">{time(item.at)}</time><span>{item.message}</span></li>)}</ol> : <p className="mt-4 rounded-xl bg-[#161b22] px-4 py-6 text-center text-sm text-[#8b949e]">ยังไม่มีเหตุการณ์ใหม่</p>}
          </section>

          {reader?.openGroupId && reader.openUntil && <section className="rounded-2xl border border-[#21262d] bg-[#11161d] p-5 shadow-sm"><p className="text-xs text-[#8b949e]">กลุ่มที่เปิดให้เพื่อนเข้าร่วม</p><p className="mt-1 font-semibold text-[#f0f6fc]">{reader.openGroupId}</p><p className="mt-1 text-xs text-[#8b949e]">หมดเวลา {time(reader.openUntil)}</p></section>}
        </aside>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Summary title="กลุ่มที่กำลังเล่น" value={backendState === 'connected' ? String(reader?.activeCount ?? activeGroups.length) : '—'} icon="groups" />
        <Summary title="ผู้เล่นที่ยังอยู่ในร้าน" value={backendState === 'connected' ? String(reader?.activePlayers ?? activeGroups.reduce((n, group) => n + group.tags.length, 0)) : '—'} icon="users" />
        <Summary title="ยอดกำลังใช้งาน" value={backendState === 'connected' && reader ? money(reader.currentBillSatang) : '—'} icon="card" />
      </div>

      <p className="mt-5 text-xs text-[#8b949e]">฿30/ชั่วโมง เริ่มชั่วโมงแรก · สูงสุด ฿150 (ชั่วโมงที่ 5) · คำนวณและยืนยันยอดโดย Backend</p>
    </div>

    {checkoutTarget && <CheckoutModal target={checkoutTarget} confirmed={checkoutConfirmed} busy={checkoutBusy} onConfirm={setCheckoutConfirmed} onClose={() => { if (!checkoutBusy) { setCheckoutTarget(null); setCheckoutConfirmed(false); } }} onSubmit={() => void submitCheckout()} />}
    {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#222720] px-5 py-3 text-sm text-white shadow-xl">{toast}</div>}
  </main>;
}

function Status({ state, label }: { state: string; label: string }) {
  const color = state === 'connected' ? 'bg-[#143226] text-[#5fe8a0]' : state === 'connecting' ? 'bg-[#332a13] text-[#e0b75c]' : 'bg-[#3a1d1a] text-[#ff8a80]';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${color}`}><i className={`h-1.5 w-1.5 rounded-full ${state === 'connected' ? 'bg-[#4e9b65]' : state === 'connecting' ? 'bg-[#c59a36]' : 'bg-[#e5534b]'}`} />{label}</span>;
}

function Summary({ title, value, icon }: { title: string; value: string; icon: string }) {
  return <div className="rounded-2xl border border-[#21262d] bg-[#11161d] p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-[#8b949e]">{title}</p><span className="text-[#a78bfa]"><Icon name={icon} /></span></div><p className="mt-3 text-3xl font-semibold tracking-tight text-[#f0f6fc]">{value}</p></div>;
}

function GroupCard({ group, scan, showCheckoutActions, onCheckout }: { group: Group; scan: ScanActivity | null; showCheckoutActions: boolean; onCheckout: (group: Group, member?: Member) => void }) {
  const scanning = scan?.groupId === group.groupId ? scan.sessionId : null;
  return <article id={`group-${group.groupId}`} className="px-5 py-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-[#f0f6fc]">กลุ่ม {group.groupId}</p><p className="mt-1 text-xs text-[#8b949e]">เริ่ม {time(group.startTime)} · สมาชิก {group.tags.length} คน</p></div><div className="text-right"><p className="text-xs text-[#8b949e]">ยอดทั้งกลุ่ม</p><p className="mt-1 font-semibold text-[#a5f3fc]">{money(group.amountSatang)}</p></div></div>
    <ul className="mt-4 space-y-2">{group.tags.map((member) => <li id={`member-${member.sessionId}`} key={member.sessionId} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 ${scanning === member.sessionId ? 'border border-[#a78bfa]/60 bg-[#201b3a]' : 'border border-transparent bg-[#161b22]'}`}>
      <div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7140dd]/40 to-[#3c55dd]/40 text-xs font-semibold text-[#c4b5fd]"><Icon name="card" size={15} /></span><div className="min-w-0"><p className="truncate text-sm font-medium text-[#e6edf3]">{member.label || `ชิป ${member.tagId.slice(-6)}`}{scanning === member.sessionId && <span className="ml-2 rounded-full bg-[#3b2f63] px-2 py-0.5 text-[10px] font-semibold text-[#c4b5fd]">กำลังสแกน</span>}</p><p className="mt-0.5 text-[11px] text-[#8b949e]">เช็กอิน {time(member.checkInTime)} · {duration(member.checkInTime)}</p></div></div>
      <div className="flex items-center gap-3"><span className="text-xs font-medium text-[#c9d1d9]">{money(member.amountSatang)}</span>{showCheckoutActions && <button onClick={() => onCheckout(group, member)} className="rounded-lg border border-[#30363d] bg-[#1c2431] px-3 py-2 text-xs font-semibold text-[#a78bfa] hover:bg-[#273040]">เช็กเอาต์รายคน</button>}</div>
    </li>)}</ul>
    {showCheckoutActions && <div className="mt-4 flex justify-end"><button onClick={() => onCheckout(group)} className="flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#7140dd] to-[#3c55dd] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90">เช็กเอาต์ทั้งกลุ่ม <Icon name="arrow" size={14} /></button></div>}
  </article>;
}

function CheckoutModal({ target, confirmed, busy, onConfirm, onClose, onSubmit }: { target: CheckoutTarget; confirmed: boolean; busy: boolean; onConfirm: (value: boolean) => void; onClose: () => void; onSubmit: () => void }) {
  const amount = target.member?.amountSatang ?? target.group.amountSatang;
  return <div className="modal-backdrop fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="w-full max-w-md rounded-2xl border border-[#30363d] bg-[#11161d] p-6 shadow-2xl">
      <div className="flex items-start justify-between"><div><h2 id="checkout-title" className="text-lg font-bold text-[#f0f6fc]">ยืนยันการเช็กเอาต์</h2><p className="mt-1 text-xs text-[#8b949e]">ตรวจสอบยอดกับลูกค้าก่อนบันทึก</p></div><button aria-label="ปิด" onClick={onClose} className="rounded-lg p-2 text-[#8b949e] hover:bg-[#1c2431]"><Icon name="close" size={17} /></button></div>
      <div className="mt-5 rounded-xl bg-[#161b22] p-4"><p className="text-xs text-[#8b949e]">{target.member ? 'เช็กเอาต์รายคน' : 'เช็กเอาต์ทั้งกลุ่ม'} · กลุ่ม {target.group.groupId}</p>{target.member && <p className="mt-2 font-medium text-[#e6edf3]">{target.member.label || `ชิป ${target.member.tagId.slice(-6)}`}</p>}<div className="mt-4 flex items-end justify-between border-t border-[#21262d] pt-3"><span className="text-sm text-[#8b949e]">ยอดที่ Backend คำนวณ</span><strong className="text-2xl text-[#a5f3fc]">{money(amount)}</strong></div></div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#30363d] p-3.5"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => onConfirm(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#a78bfa]" /><span className="text-xs leading-5 text-[#c9d1d9]">ลูกค้าตรวจสอบยอดและยืนยันจำนวนเงินนี้แล้ว</span></label>
      <p className="mt-3 text-[11px] leading-5 text-[#8b949e]">ระบบจะส่งยอดที่แสดงให้ Backend ตรวจซ้ำ หากยอดเปลี่ยนต้องให้ลูกค้ายืนยันใหม่</p>
      <div className="mt-5 flex gap-2"><button disabled={busy} onClick={onClose} className="h-10 flex-1 rounded-xl border border-[#30363d] text-xs font-semibold text-[#8b949e] hover:bg-[#161b22]">ยกเลิก</button><button disabled={!confirmed || busy} onClick={onSubmit} className="h-10 flex-1 rounded-xl bg-gradient-to-br from-[#7140dd] to-[#3c55dd] text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:from-[#3a3670] disabled:to-[#373a63]">{busy ? 'กำลังบันทึก…' : 'ยืนยันเช็กเอาต์'}</button></div>
    </section>
  </div>;
}
