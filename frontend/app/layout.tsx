import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Bue Banana | Board Game Café', template: '%s | Bue Banana' },
  description: 'คาเฟ่บอร์ดเกม พร้อมระบบเช็กอินด้วยบัตร NFC และสินค้า 3D-printed',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
