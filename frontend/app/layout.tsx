import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { ThemeProvider } from './theme-provider';

export const metadata: Metadata = {
  title: { default: 'Bue Banana | Board Game Café', template: '%s | Bue Banana' },
  description: 'คาเฟ่บอร์ดเกม พร้อมระบบเช็กอินด้วยบัตร NFC และสินค้า 3D-printed',
};

const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme')||'system';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;document.documentElement.classList.toggle('dark',r==='dark');document.documentElement.style.colorScheme=r;}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="buebanana-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
