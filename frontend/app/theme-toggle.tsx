'use client';
import { useState } from 'react';
import { useTheme } from './theme-provider';

const LABELS: Record<string, string> = { light: '☀️ กลางวัน', dark: '🌙 กลางคืน', system: '🖥️ ตามระบบ' };

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [menu, setMenu] = useState(false);
  const current = resolvedTheme ?? 'system';
  return (
    <div className="relative" data-hermes-ignore>
      <button type="button" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}
        className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border-2)] px-3 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]">
        <span>{LABELS[current] ?? LABELS.system}</span><span aria-hidden="true">▾</span>
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-[var(--border-2)] bg-[var(--surface)] shadow-xl">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <button key={mode} type="button" role="menuitem" onClick={() => { setTheme(mode); setMenu(false); }}
              className="block w-full px-4 py-2.5 text-left text-xs text-[var(--text)] hover:bg-[var(--surface-2)]">
              {LABELS[mode]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
