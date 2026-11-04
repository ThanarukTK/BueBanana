'use client';

import { useEffect, useState } from 'react';

type Product = {
  productId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  available?: boolean;
  availability?: string;
};
type ProductEnvelope = {
  data?: Product | Product[] | { product?: Product; products?: Product[] };
  error?: { message?: string };
};

function listFrom(result: ProductEnvelope): Product[] | null {
  if (Array.isArray(result.data)) return result.data;
  if (result.data && 'products' in result.data && Array.isArray(result.data.products)) return result.data.products;
  return null;
}

function productFrom(result: ProductEnvelope): Product | null {
  if (!result.data || Array.isArray(result.data)) return null;
  if ('product' in result.data && result.data.product) return result.data.product;
  if ('productId' in result.data) return result.data;
  return null;
}

function availability(product: Product) {
  if (product.available === true || product.availability === 'available') return 'พร้อมจำหน่าย';
  if (product.available === false || product.availability === 'unavailable') return 'สินค้าหมด';
  if (product.availability === 'limited') return 'สินค้าเหลือน้อย';
  return null;
}

export default function ProductCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProducts() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/customer/products', { cache: 'no-store', signal: controller.signal });
        const result = await response.json().catch(() => null) as ProductEnvelope | null;
        if (!response.ok) {
          const message = result?.error?.message
            ?? (response.status === 404 ? 'Backend ยังไม่มี API แค็ตตาล็อกสินค้า' : `โหลดสินค้าไม่สำเร็จ (${response.status})`);
          throw new Error(message);
        }
        if (!result) throw new Error('Backend ส่งข้อมูลแค็ตตาล็อกมาไม่ถูกต้อง');
        const entries = listFrom(result);
        if (!entries) throw new Error('รูปแบบข้อมูลแค็ตตาล็อกจาก Backend ไม่ถูกต้อง');
        setProducts(entries.filter((product) => product.productId && product.name));
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'โหลดสินค้าไม่สำเร็จ');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadProducts();
    return () => controller.abort();
  }, [retry]);

  async function openDetails(product: Product) {
    setSelected(product);
    setDetail(product);
    setDetailError('');
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/customer/products/${encodeURIComponent(product.productId)}`, { cache: 'no-store' });
      const result = await response.json().catch(() => null) as ProductEnvelope | null;
      if (!response.ok) {
        const message = result?.error?.message
          ?? (response.status === 404 ? 'Backend ยังไม่มี API รายละเอียดสินค้า' : `โหลดรายละเอียดไม่สำเร็จ (${response.status})`);
        throw new Error(message);
      }
      if (!result) throw new Error('Backend ส่งข้อมูลรายละเอียดสินค้าไม่ถูกต้อง');
      const fullProduct = productFrom(result);
      if (!fullProduct) throw new Error('รูปแบบรายละเอียดสินค้าจาก Backend ไม่ถูกต้อง');
      setDetail(fullProduct);
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : 'โหลดรายละเอียดไม่สำเร็จ');
    } finally {
      setDetailLoading(false);
    }
  }

  return <>
    {loading ? <div role="status" className="mt-8 flex min-h-56 items-center justify-center rounded-2xl border border-[#e7e9df] bg-white text-sm text-[#7a8075]">กำลังโหลดสินค้า…</div>
      : error ? <div className="mt-8 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-[#eadbb5] bg-white px-5 py-10 text-center"><p role="alert" className="text-sm font-medium text-[#725c29]">{error}</p><button onClick={() => setRetry((value) => value + 1)} className="mt-4 rounded-lg border border-[#dfe3d8] px-4 py-2 text-xs font-semibold text-[#425c43] hover:bg-[#f5f7f1]">ลองอีกครั้ง</button></div>
        : products.length === 0 ? <div className="mt-8 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-[#cdd6c7] bg-white/65 px-5 py-10 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf3e9] text-2xl">🧩</span><h3 className="mt-4 font-semibold">ยังไม่มีสินค้าในแค็ตตาล็อก</h3><p className="mt-2 max-w-md text-xs leading-5 text-[#7a8075]">เมื่อมีรายการสินค้าเผยแพร่ จะแสดงชื่อ รูปภาพ รายละเอียด และสถานะที่นี่</p></div>
          : <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <li key={product.productId} className="overflow-hidden rounded-2xl border border-[#e2e6dc] bg-white shadow-[0_8px_30px_rgba(30,39,28,.04)]"><button onClick={() => void openDetails(product)} className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#537c54]"><ProductImage product={product} /><div className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">{product.name}</h3>{availability(product) && <span className="shrink-0 rounded-full bg-[#edf3e9] px-2 py-1 text-[10px] font-medium text-[#527251]">{availability(product)}</span>}</div>{product.description && <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#7a8075]">{product.description}</p>}<span className="mt-4 inline-block text-xs font-semibold text-[#527251]">ดูรายละเอียด <span aria-hidden="true">→</span></span></div></button></li>)}</ul>}

    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#20251f]/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="product-detail-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex justify-end p-3"><button onClick={() => setSelected(null)} aria-label="ปิดรายละเอียด" className="rounded-lg px-3 py-2 text-sm text-[#667060] hover:bg-[#f4f5f1]">ปิด ✕</button></div>
        <div className="px-5 pb-6"><ProductImage product={detail ?? selected} large /><div className="mt-5 flex items-start justify-between gap-3"><h2 id="product-detail-title" className="text-xl font-semibold">{(detail ?? selected).name}</h2>{availability(detail ?? selected) && <span className="shrink-0 rounded-full bg-[#edf3e9] px-2.5 py-1 text-[10px] font-medium text-[#527251]">{availability(detail ?? selected)}</span>}</div>{detailLoading && <p role="status" className="mt-3 text-xs text-[#7a8075]">กำลังโหลดรายละเอียด…</p>}{detail?.description && <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#6f756b]">{detail.description}</p>}{detailError && <p role="status" className="mt-3 text-xs text-[#8a7440]">{detailError} · แสดงข้อมูลสรุปจากรายการแทน</p>}</div>
      </section>
    </div>}
  </>;
}

function ProductImage({ product, large = false }: { product: Product; large?: boolean }) {
  return <div className={`relative flex ${large ? 'h-56' : 'h-52'} items-center justify-center overflow-hidden bg-[#eff2e9]`}>
    {product.imageUrl
      // Image hosts come from the catalog API, so render the provided URL without a Next host allow-list.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
      : <div role="img" aria-label={`ไม่มีรูปภาพสำหรับ ${product.name}`} className="text-4xl">🧩</div>}
  </div>;
}
