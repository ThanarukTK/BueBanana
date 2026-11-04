import type { Metadata } from 'next';
import Link from 'next/link';
import ProductCatalog from './ProductCatalog';

export const metadata: Metadata = {
  title: 'Board Game Café',
  description: 'ข้อมูลการใช้งานชิปและสินค้า 3D-printed ของ Bue Banana Board Game Café',
};

const steps = [
  { number: '01', title: 'รับชิป', detail: 'รับชิปจากพนักงาน แล้วใช้ชิปเดิมตลอดรอบเล่น' },
  { number: '02', title: 'แตะเพื่อเริ่มเล่น', detail: 'แตะชิปที่เครื่องอ่าน หน้าจอจะแสดงผลการเช็กอินและกลุ่มของคุณ' },
  { number: '03', title: 'ชวนเพื่อนเข้ากลุ่ม', detail: 'ให้สมาชิกในกลุ่มแตะเปิดหน้ากลุ่มก่อน แล้วสมาชิกใหม่แตะชิปภายในช่วงเวลาที่ระบบเปิดรับ' },
  { number: '04', title: 'แจ้งพนักงานก่อนกลับ', detail: 'แตะชิปเพื่อแสดงกลุ่ม แล้วให้พนักงานแจ้งยอดและดำเนินการเช็กเอาต์' },
];

export default function CustomerPage() {
  return <main className="min-h-screen overflow-hidden bg-[#fbfaf6] text-[#25291f]">
    <header className="relative z-10 border-b border-[#e9e8df] bg-[#fbfaf6]/90 backdrop-blur">
      <nav aria-label="เมนูหลัก" className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/customer" className="flex items-center gap-2.5" aria-label="Bue Banana หน้าแรก">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#315b43] text-xl">🍌</span>
          <span><span className="block text-sm font-bold tracking-wide">BUE BANANA</span><span className="block text-[10px] tracking-[.16em] text-[#818579]">BOARD GAME CAFÉ</span></span>
        </Link>
        <div className="hidden items-center gap-7 text-sm text-[#5c6257] md:flex">
          <a href="#about" className="hover:text-[#315b43]">เกี่ยวกับ</a>
          <a href="#how-to-play" className="hover:text-[#315b43]">วิธีใช้ชิป</a>
          <a href="#products" className="hover:text-[#315b43]">สินค้า</a>
        </div>
        <a href="#how-to-play" className="rounded-full bg-[#315b43] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#244833]">วิธีเริ่มเล่น</a>
      </nav>
    </header>

    <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.08fr_.92fr] lg:pb-28">
      <div className="pointer-events-none absolute -right-28 -top-20 h-[30rem] w-[30rem] rounded-full bg-[#e9edcf] opacity-70 blur-3xl" />
      <div className="relative">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#dce4d4] bg-white/80 px-3.5 py-2 text-[11px] font-semibold tracking-wide text-[#527251]"><span className="h-1.5 w-1.5 rounded-full bg-[#6b9b63]" /> BOARD GAMES · GOOD COMPANY</p>
        <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.17] tracking-tight sm:text-6xl">พื้นที่เล่นเกม<br /><span className="text-[#537c54]">ที่เริ่มง่าย</span> แค่แตะชิป</h1>
        <p className="mt-5 max-w-xl text-sm leading-7 text-[#6e7469] sm:text-base">ยินดีต้อนรับสู่ Bue Banana Board Game Café เลือกเกมที่ชอบ ชวนเพื่อนมาสนุก แล้วใช้ชิปเช็กอินที่เครื่องอ่านของร้าน</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#how-to-play" className="rounded-xl bg-[#315b43] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#244833]">ดูวิธีเช็กอิน <span aria-hidden="true">→</span></a>
          <a href="#products" className="rounded-xl border border-[#dfe3d8] bg-white px-5 py-3 text-sm font-semibold text-[#425c43] transition hover:bg-[#f5f7f1]">สำรวจสินค้า</a>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#e8e8df] pt-5 text-xs text-[#70776c]"><span className="flex items-center gap-2"><span className="text-base">🎲</span> บอร์ดเกมและเพื่อน</span><span className="flex items-center gap-2"><span className="text-base">📶</span> เช็กอินด้วยชิป</span><span className="flex items-center gap-2"><span className="text-base">🧩</span> สินค้า 3D-printed</span></div>
      </div>

      <div className="relative mx-auto w-full max-w-[510px]">
        <div className="absolute inset-5 rotate-[-5deg] rounded-[2rem] bg-[#dce8d1]" />
        <div className="relative rounded-[2rem] border border-white/80 bg-[#e9efdf] p-5 shadow-[0_25px_80px_rgba(45,70,43,.14)] sm:p-7">
          <div className="flex items-center justify-between"><span className="rounded-full bg-white/80 px-3 py-1.5 text-[10px] font-semibold tracking-wider text-[#62805f]">YOUR GAME NIGHT</span><span className="text-xs text-[#788474]">✦ ✦ ✦</span></div>
          <div className="relative mt-5 flex min-h-[285px] items-center justify-center overflow-hidden rounded-[1.4rem] bg-[#cad8b9] sm:min-h-[340px]">
            <div className="absolute left-[-2rem] top-[-2rem] h-48 w-48 rounded-full bg-[#e3d7aa]/80" />
            <div className="absolute bottom-[-4rem] right-[-2rem] h-56 w-56 rounded-full bg-[#a8c0a1]" />
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-[#789574]/40" />
            <div className="relative flex h-48 w-64 rotate-[-7deg] items-center justify-center rounded-[2rem] border border-white/60 bg-[#f8f5e9] shadow-xl sm:h-56 sm:w-72">
              <div className="absolute left-5 top-5 h-7 w-7 rounded-lg border border-[#d9dece]" /><div className="absolute right-5 top-5 h-7 w-7 rounded-lg border border-[#d9dece]" />
              <div className="text-center"><span className="text-7xl drop-shadow-sm sm:text-8xl">🎲</span><p className="mt-2 text-[10px] font-bold tracking-[.2em] text-[#567258]">ROLL · PLAY · REPEAT</p></div>
            </div>
            <div className="absolute bottom-4 left-4 rounded-xl bg-white/90 px-3 py-2 text-[10px] font-semibold text-[#52684d] shadow-sm">GOOD TIMES, ONE TAP AWAY</div>
            <div className="absolute right-4 top-4 flex h-12 w-12 rotate-12 items-center justify-center rounded-2xl bg-[#f2cf62] text-2xl shadow-md">🍌</div>
          </div>
        <div className="flex items-center justify-between px-1 pt-5"><div><p className="text-sm font-semibold">พร้อมเริ่มเกมหรือยัง?</p><p className="mt-1 text-xs text-[#7d8379]">รับชิปจากพนักงานแล้วแตะที่เครื่องอ่าน</p></div><span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg text-[#527251]">↗</span></div>
        </div>
      </div>
    </section>

    <section id="about" className="border-y border-[#ecebe3] bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-[.8fr_1.2fr] md:items-center md:py-16">
        <div><p className="text-[11px] font-bold tracking-[.16em] text-[#6b8b68]">ABOUT BUE BANANA</p><h2 className="mt-3 text-2xl font-semibold sm:text-3xl">คาเฟ่บอร์ดเกมสำหรับช่วงเวลาดี ๆ</h2></div>
        <p className="max-w-2xl text-sm leading-7 text-[#6f756b]">Bue Banana เป็นคาเฟ่บอร์ดเกมที่ใช้ชิปช่วยบันทึกรอบเล่น ลูกค้าแตะชิปเพื่อเริ่มรอบและเข้าร่วมกลุ่มได้ ส่วนการแจ้งยอดและเช็กเอาต์มีพนักงานช่วยดูแล</p>
      </div>
    </section>

    <section id="how-to-play" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-xl text-center"><p className="text-[11px] font-bold tracking-[.16em] text-[#6b8b68]">SIMPLE CHIP FLOW</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">เริ่มเล่นได้ในไม่กี่ขั้น</h2><p className="mt-3 text-sm leading-6 text-[#7a8075]">ระบบแสดงสถานะบนจอเครื่องอ่าน และบันทึกเวลาเล่นให้อัตโนมัติ</p></div>
      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{steps.map((step) => <li key={step.number} className="rounded-2xl border border-[#e7e9df] bg-white p-5 shadow-[0_8px_30px_rgba(30,39,28,.035)]"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf3e9] text-xs font-bold text-[#527251]">{step.number}</span><h3 className="mt-5 font-semibold">{step.title}</h3><p className="mt-2 text-xs leading-6 text-[#7a8075]">{step.detail}</p></li>)}</ol>
      <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-[#315b43] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7"><div><p className="text-xs text-white/70">อัตราค่าบริการ</p><p className="mt-1 text-xl font-semibold">฿30 เข้าเล่น + <span className="text-sm font-normal text-white/75">฿30 / ชั่วโมง</span> · <span className="text-sm font-normal text-white/80">สูงสุด ฿150 / วัน / คน</span></p></div><p className="max-w-xl text-xs leading-5 text-white/75">คิดเป็นชั่วโมงที่เริ่มเล่น (เศษนาทีปัดขึ้นเป็น 1 ชั่วโมง) · ยอดสุดท้ายคำนวณโดยระบบและแจ้งให้ตรวจสอบก่อนเช็กเอาต์</p></div>
    </section>

    <section id="products" className="border-y border-[#ecebe3] bg-[#f2f3eb]">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-bold tracking-[.16em] text-[#6b8b68]">MADE FOR GAME LOVERS</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">สินค้า 3D-printed</h2><p className="mt-2 text-sm text-[#7a8075]">ผลงานและอุปกรณ์บอร์ดเกมจากร้าน</p></div><span className="rounded-full border border-[#dce1d4] bg-white/70 px-3 py-1.5 text-[10px] font-semibold text-[#71806d]">PRODUCT CATALOG</span></div>
        <ProductCatalog />
      </div>
    </section>

    <footer className="bg-[#fbfaf6]"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8"><Link href="/customer" className="flex items-center gap-2 text-xs font-semibold text-[#52664e]"><span className="text-lg">🍌</span> BUE BANANA · BOARD GAME CAFÉ</Link><p className="text-[11px] text-[#858a80]">ข้อมูลระบบชิปและสินค้า 3D-printed</p><Link href="/login" className="text-xs font-medium text-[#527251] hover:underline">เข้าสู่ระบบพนักงาน</Link></div></footer>
  </main>;
}
