'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
type ScanDetailsSelection = { groupId: string; sessionIds: string[] };

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
  const [reader, setReader] = useState<ApiEnvelope['reader']>();
  const [backendState, setBackendState] = useState<BackendState>('connecting');
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('connecting');
  const [loadError, setLoadError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [scan, setScan] = useState<ScanActivity | null>(null);
  const [pendingScanFocus, setPendingScanFocus] = useState<ScanActivity | null>(null);
  const [scanDetailsSelection, setScanDetailsSelection] = useState<ScanDetailsSelection | null>(null);
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
        setScanDetailsSelection((current) => ({
          groupId: nextScan.groupId,
          sessionIds: current?.groupId === nextScan.groupId
            ? [...new Set([...current.sessionIds, nextScan.sessionId])]
            : [nextScan.sessionId],
        }));
        setCheckoutConfirmed(false);
        addActivity(`มีการแตะบัตร · กลุ่ม ${String(data.groupId ?? '')}`, at);
        void refresh().then((freshGroups) => {
          if (!freshGroups) return;
          const group = freshGroups.find((item) => item.groupId === nextScan.groupId);
          if (!group?.tags.some((member) => member.sessionId === nextScan.sessionId)) {
            setScanDetailsSelection((current) => current?.groupId === nextScan.groupId
              ? { ...current, sessionIds: current.sessionIds.filter((sessionId) => sessionId !== nextScan.sessionId) }
              : current);
          }
        });
      } else if (event.event === 'group.updated') {
        const data = event.data ?? {};
        addActivity(`ข้อมูลกลุ่ม ${String(data.groupId ?? '')} เปลี่ยนแปลง`, at);
        void refresh();
      } else if (event.event === 'session.closed') {
        const data = event.data ?? {};
        const sessionId = String(data.sessionId ?? '');
        setScan((current) => current?.sessionId === sessionId ? null : current);
        setScanDetailsSelection((current) => current
          ? { ...current, sessionIds: current.sessionIds.filter((selectedId) => selectedId !== sessionId) }
          : current);
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

  async function submitCheckout() {
    if (!scanDetailsSelection || !checkoutConfirmed || checkoutBusy) return;
    const selectedGroup = groups.find((group) => group.groupId === scanDetailsSelection.groupId);
    const selectedMembers = selectedGroup?.tags.filter((member) => scanDetailsSelection.sessionIds.includes(member.sessionId)) ?? [];
    if (!selectedGroup || selectedMembers.length === 0) return;

    setCheckoutBusy(true);
    let checkedOut = 0;
    let failure = '';
    try {
      for (const member of selectedMembers) {
        const response = await fetch(`/api/backend/api/v1/sessions/${encodeURIComponent(member.sessionId)}/check-out`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: member.amountSatang, customerConfirmed: true }),
        });
        const result = await response.json() as ApiEnvelope;
        if (!response.ok) {
          failure = result.error?.message ?? `เช็กเอาต์ ${member.label || member.tagId} ไม่สำเร็จ`;
          break;
        }
        checkedOut += 1;
      }

      if (checkedOut > 0) {
        addActivity(`เช็กเอาต์สมาชิกแล้ว ${checkedOut}/${selectedMembers.length} คน · กลุ่ม ${selectedGroup.groupId}`, new Date().toISOString());
      }
      if (checkedOut > 0 || failure) await refresh();
      if (failure) {
        setToast(checkedOut > 0 ? `บันทึกแล้ว ${checkedOut} คน · ${failure}` : failure);
        setCheckoutConfirmed(false);
      } else {
        setToast(`บันทึกเช็กเอาต์ ${checkedOut} คนแล้ว`);
        setScanDetailsSelection(null);
        setCheckoutConfirmed(false);
      }
    } catch {
      setToast(checkedOut > 0 ? `บันทึกแล้ว ${checkedOut} คน · การเชื่อมต่อขาดหาย` : 'เชื่อม Backend ไม่ได้ · ลองอีกครั้ง');
      setCheckoutConfirmed(false);
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

  if (!authChecked || !staff) return <main className="flex min-h-screen items-center justify-center bg-[#f7f8f4] text-sm text-[#858a80]">กำลังตรวจสอบบัญชีพนักงาน…</main>;

  return <main className="min-h-screen bg-[#f7f8f4] text-[#222820]">
    {previewMode && <div role="status" className="bg-[#fff4d7] px-4 py-2 text-center text-xs font-medium text-[#765d20]">โหมด Preview · ไม่ได้เข้าสู่ระบบ · ไม่มีการโหลดข้อมูลจริง</div>}
    <header className="border-b border-[#e6e9e1] bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#315b43] text-xl">🍌</div><div><p className="text-sm font-bold">Bue Banana</p><p className="text-[10px] tracking-wide text-[#858a80]">STAFF · NFC GROUP FLOW</p></div></div>
        <div className="flex items-center gap-3">
          <Status state={backendState} label={backendState === 'connected' ? 'Backend เชื่อมต่อ' : backendState === 'connecting' ? 'กำลังเชื่อม Backend' : 'Backend ขาดการเชื่อมต่อ'} />
          <Link href="/customer" className="hidden rounded-lg border border-[#e5e8e1] px-3 py-2 text-xs font-semibold text-[#315b43] hover:bg-[#f7f8f4] sm:inline-flex">หน้าเว็บลูกค้า</Link>
          {staff.role === 'admin' && <a href="/admin/staff" className="hidden rounded-lg border border-[#e5e8e1] px-3 py-2 text-xs font-semibold text-[#315b43] hover:bg-[#f7f8f4] sm:inline-flex">จัดการบัญชี</a>}
          <span className="hidden text-right sm:block"><span className="block text-xs font-semibold">{staff.displayName}</span><span className="text-[10px] text-[#858a80]">{staff.role === 'admin' ? 'Admin' : 'Staff'}</span></span>
          <button onClick={() => void logout()} className="rounded-lg border border-[#e5e8e1] px-3 py-2 text-xs font-semibold text-[#5c655b] hover:bg-[#f7f8f4]">ออกจากระบบ</button>
          <button onClick={() => void refresh()} aria-label="โหลดข้อมูลใหม่" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e5e8e1] text-[#5c655b] hover:bg-[#f7f8f4]"><Icon name="refresh" size={16} /></button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold tracking-[.15em] text-[#63806b]">STAFF VIEW</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">กลุ่มที่กำลังเล่น</h1><p className="mt-2 text-sm text-[#7e857b]">สแกนชิปของสมาชิกที่จะออกเพื่อเลือก แล้วตรวจสอบรายละเอียดทั้งกลุ่มก่อนยืนยัน</p></div>
        {updatedAt && <p className="text-xs text-[#858a80]">อัปเดต {time(updatedAt)}</p>}
      </div>

      {backendState === 'offline' && <div role="alert" className="mt-5 rounded-xl border border-[#eadbb5] bg-[#fff9e9] px-4 py-3 text-sm text-[#725c29]">{loadError || 'เชื่อมต่อ Backend ไม่ได้'} {!previewMode && <span className="block pt-1 text-xs">ตรวจค่า API_BASE_URL และสถานะบัญชี Backend</span>}</div>}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="overflow-hidden rounded-2xl border border-[#e6e9e1] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0e9] px-5 py-4">
            <div><h2 className="font-semibold">กลุ่มและสมาชิก</h2><p className="mt-1 text-xs text-[#858a80]">ไม่มีการระบุหมายเลขโต๊ะในข้อมูล Backend</p></div>
            <label className="sr-only" htmlFor="group-filter">ค้นหากลุ่มหรือสมาชิก</label>
            <input id="group-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="ค้นหากลุ่มหรือสมาชิก" className="h-9 w-full rounded-lg border border-[#e5e8e1] px-3 text-sm outline-none focus:border-[#829b83] sm:w-56" />
          </div>
          {backendState === 'connected' && activeGroups.length === 0
            ? <p className="px-5 py-14 text-center text-sm text-[#858a80]">ไม่มีกลุ่มที่กำลังเล่น</p>
            : <div className="divide-y divide-[#edf0e9]">{activeGroups.map((group) => <GroupCard key={group.groupId} group={group} scan={scanDetailsSelection?.groupId === group.groupId && scanDetailsSelection.sessionIds.includes(scan?.sessionId ?? '') ? scan : null} />)}</div>}
          {backendState === 'connecting' && <p className="px-5 py-14 text-center text-sm text-[#858a80]">กำลังโหลดกลุ่มจาก Backend…</p>}
          {backendState === 'offline' && groups.length === 0 && <p className="px-5 py-10 text-center text-sm text-[#858a80]">ยังไม่มีข้อมูลกลุ่ม · ระบบไม่แสดงข้อมูลตัวอย่าง</p>}
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-[#e6e9e1] bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">กำลังแตะบัตร</h2><p className="mt-1 text-xs text-[#858a80]">สถานะจากเหตุการณ์สแกนล่าสุด</p></div><Status state={realtimeState} label={realtimeLabel} /></div>
            {activeScan
              ? <div className="mt-4 rounded-xl border border-[#d5e5d4] bg-[#f1f7f0] p-4"><p className="text-sm font-semibold text-[#315b43]">{scanningMember?.label || `ชิป ${activeScan.scanningTagId.slice(-6)}`}</p><p className="mt-1 text-xs text-[#667466]">กลุ่ม {activeScan.groupId}</p><p className="mt-2 text-[11px] text-[#879184]">เลือกสมาชิกสำหรับเช็กเอาต์ · {time(activeScan.at)}</p></div>
              : <p className="mt-4 rounded-xl bg-[#f6f7f3] px-4 py-6 text-center text-sm text-[#858a80]">ยังไม่มีการแตะบัตรใน 30 วินาทีล่าสุด</p>}
            <p className="mt-3 text-[11px] leading-5 text-[#8a8f86]">สถานะนี้แสดงกลุ่มและสมาชิกจาก Backend ไม่ได้ระบุตำแหน่งโต๊ะ</p>
          </section>

          <section className="rounded-2xl border border-[#e6e9e1] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold">กิจกรรมจากระบบ</h2><p className="mt-1 text-xs text-[#858a80]">รับจาก WebSocket /ws/admin</p></div><span className={`h-2 w-2 rounded-full ${realtimeState === 'connected' ? 'bg-[#4e9b65]' : 'bg-[#c59a36]'}`} /></div>
            {activity.length ? <ol className="mt-4 space-y-3">{activity.map((item) => <li key={item.id} className="flex gap-3 text-xs"><time className="shrink-0 text-[#7d8a79]">{time(item.at)}</time><span>{item.message}</span></li>)}</ol> : <p className="mt-4 rounded-xl bg-[#f6f7f3] px-4 py-6 text-center text-sm text-[#858a80]">ยังไม่มีเหตุการณ์ใหม่</p>}
          </section>

          {reader?.openGroupId && reader.openUntil && <section className="rounded-2xl border border-[#e6e9e1] bg-white p-5 shadow-sm"><p className="text-xs text-[#858a80]">กลุ่มที่เปิดให้เพื่อนเข้าร่วม</p><p className="mt-1 font-semibold">{reader.openGroupId}</p><p className="mt-1 text-xs text-[#858a80]">หมดเวลา {time(reader.openUntil)}</p></section>}
        </aside>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Summary title="กลุ่มที่กำลังเล่น" value={backendState === 'connected' ? String(reader?.activeCount ?? activeGroups.length) : '—'} icon="groups" />
        <Summary title="ผู้เล่นที่ยังอยู่ในร้าน" value={backendState === 'connected' ? String(reader?.activePlayers ?? activeGroups.reduce((n, group) => n + group.tags.length, 0)) : '—'} icon="users" />
        <Summary title="ยอดกำลังใช้งาน" value={backendState === 'connected' && reader ? money(reader.currentBillSatang) : '—'} icon="card" />
      </div>

      <p className="mt-5 text-xs text-[#8a8f86]">คิดค่าบริการ ฿30 ต่อชั่วโมง · คำนวณและยืนยันยอดโดย Backend</p>
    </div>

    {scanDetailsSelection && (() => {
      const group = groups.find((item) => item.groupId === scanDetailsSelection.groupId);
      return group ? <CheckoutModal group={group} selectedSessionIds={scanDetailsSelection.sessionIds} confirmed={checkoutConfirmed} busy={checkoutBusy} onConfirm={setCheckoutConfirmed} onClose={() => { if (!checkoutBusy) { setScanDetailsSelection(null); setCheckoutConfirmed(false); } }} onSubmit={() => void submitCheckout()} /> : null;
    })()}
    {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#222720] px-5 py-3 text-sm text-white shadow-xl">{toast}</div>}
  </main>;
}

function Status({ state, label }: { state: string; label: string }) {
  const color = state === 'connected' ? 'bg-[#edf5ed] text-[#3f7650]' : state === 'connecting' ? 'bg-[#faf4e6] text-[#8a7440]' : 'bg-[#fbeeed] text-[#9b5146]';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${color}`}><i className={`h-1.5 w-1.5 rounded-full ${state === 'connected' ? 'bg-[#4b9b62]' : state === 'connecting' ? 'bg-[#c59a36]' : 'bg-[#bd5b4e]'}`} />{label}</span>;
}

function Summary({ title, value, icon }: { title: string; value: string; icon: string }) {
  return <div className="rounded-2xl border border-[#e6e9e1] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-[#747b71]">{title}</p><span className="text-[#587b5d]"><Icon name={icon} /></span></div><p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p></div>;
}

function GroupCard({ group, scan }: { group: Group; scan: ScanActivity | null }) {
  const scanning = scan?.groupId === group.groupId ? scan.sessionId : null;
  return <article id={`group-${group.groupId}`} className="px-5 py-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">กลุ่ม {group.groupId}</p><p className="mt-1 text-xs text-[#858a80]">เริ่ม {time(group.startTime)} · สมาชิก {group.tags.length} คน</p></div><div className="text-right"><p className="text-xs text-[#858a80]">ยอดทั้งกลุ่ม</p><p className="mt-1 font-semibold">{money(group.amountSatang)}</p></div></div>
    <ul className="mt-4 space-y-2">{group.tags.map((member) => <li id={`member-${member.sessionId}`} key={member.sessionId} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 ${scanning === member.sessionId ? 'bg-[#eaf4e8] ring-2 ring-[#86aa80]' : 'bg-[#f7f8f5]'}`}>
      <div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-[#587b5d]"><Icon name="card" size={15} /></span><div className="min-w-0"><p className="truncate text-sm font-medium">{member.label || `ชิป ${member.tagId.slice(-6)}`}{scanning === member.sessionId && <span className="ml-2 rounded-full bg-[#dcebd9] px-2 py-0.5 text-[10px] font-semibold text-[#315b43]">เลือกแล้ว</span>}</p><p className="mt-0.5 text-[11px] text-[#858a80]">เช็กอิน {time(member.checkInTime)} · {duration(member.checkInTime)}</p></div></div>
      <div className="flex items-center gap-3"><span className="text-xs font-medium">{money(member.amountSatang)}</span></div>
    </li>)}</ul>
  </article>;
}

function CheckoutModal({ group, selectedSessionIds, confirmed, busy, onConfirm, onClose, onSubmit }: { group: Group; selectedSessionIds: string[]; confirmed: boolean; busy: boolean; onConfirm: (value: boolean) => void; onClose: () => void; onSubmit: () => void }) {
  const selectedMembers = group.tags.filter((member) => selectedSessionIds.includes(member.sessionId));
  const selectedTotal = selectedMembers.reduce((total, member) => total + member.amountSatang, 0);
  if (selectedMembers.length === 0) return null;
  return <div className="modal-backdrop fixed inset-0 z-40 flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between"><div><h2 id="checkout-title" className="text-lg font-bold">รายละเอียดกลุ่ม {group.groupId}</h2><p className="mt-1 text-xs text-[#858a80]">สแกนสมาชิกคนอื่นในกลุ่มเพื่อเลือกเพิ่มก่อนยืนยันเช็กเอาต์</p></div><button aria-label="ปิด" onClick={onClose} className="rounded-lg p-2 text-[#858a80] hover:bg-[#f4f5f0]"><Icon name="close" size={17} /></button></div>
      <ul className="mt-5 max-h-[45vh] space-y-2 overflow-y-auto">{group.tags.map((member) => { const selected = selectedSessionIds.includes(member.sessionId); return <li key={member.sessionId} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-3 ${selected ? 'bg-[#eaf4e8] ring-2 ring-[#86aa80]' : 'bg-[#f7f8f5]'}`}><div><p className="text-sm font-medium">{member.label || `ชิป ${member.tagId.slice(-6)}`}{selected && <span className="ml-2 rounded-full bg-[#dcebd9] px-2 py-0.5 text-[10px] font-semibold text-[#315b43]">เลือกเช็กเอาต์</span>}</p><p className="mt-1 text-[11px] text-[#858a80]">เช็กอิน {time(member.checkInTime)} · {duration(member.checkInTime)}</p></div><strong className="shrink-0 text-sm">{money(member.amountSatang)}</strong></li>; })}</ul>
      <div className="mt-4 flex items-end justify-between rounded-xl bg-[#f6f7f3] p-4"><span className="text-sm text-[#747b71]">ยอดของ {selectedMembers.length} คนที่เลือก</span><strong className="text-2xl text-[#315b43]">{money(selectedTotal)}</strong></div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#e5e8e1] p-3.5"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => onConfirm(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#315b43]" /><span className="text-xs leading-5">ลูกค้าตรวจสอบยอดของสมาชิกที่เลือกและยืนยันแล้ว</span></label>
      <div className="mt-5 flex gap-2"><button disabled={busy} onClick={onClose} className="h-10 flex-1 rounded-xl border border-[#e5e8e1] text-xs font-semibold text-[#747b71] hover:bg-[#f7f8f4]">ปิด</button><button disabled={!confirmed || busy} onClick={onSubmit} className="h-10 flex-1 rounded-xl bg-[#315b43] text-xs font-semibold text-white hover:bg-[#244833] disabled:cursor-not-allowed disabled:bg-[#aeb9ad]">{busy ? 'กำลังบันทึก…' : `ยืนยันเช็กเอาต์ ${selectedMembers.length} คน`}</button></div>
    </section>
  </div>;
}
