'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DPI, containFit, computeGridLayout } from '@/lib/helpers';
import './globals.css';

type Sheet = { label: string; inches: { w: number; h: number } };
const SHEETS: Record<'wafer_8x11'|'frosting_a4', Sheet> = {
  wafer_8x11: { label: 'Wafer Paper — 8 × 11 in', inches: { w: 8, h: 11 } },
  frosting_a4: { label: 'Frosting Sheet — A4 (8.27 × 11.69 in)', inches: { w: 8.27, h: 11.69 } },
};
type SheetKey = keyof typeof SHEETS;

type Shape = 'rect'|'circle'|'float';

type ImgItem = {
  id: string; src: string; natW: number; natH: number; wIn: number; hIn: number; xIn: number; yIn: number; rotation: number; lockAspect: boolean; shape: Shape;
};

type LayoutChoice =
  | { kind: 'grid'; sizeIn: number; shape: Shape; label: string }
  | { kind: 'round_center'; diamIn: number; label: string }
  | { kind: 'full_sheet'; label: string };

type CartLine = {
  id: string; sheetKey: SheetKey; layout: LayoutChoice; previewDataUrl: string; qty: number; rush: boolean; cutting: boolean; designFee: number;
};

const BASE_PRICE_PER_SHEET = 10;
const MAX_QTY_PER_LINE = 10;

// Pricing & revisions
const AI_DESIGN_BASE_FEE = 20;           // AI-assisted base
const AI_INCLUDED_GENERATES = 6;         // 1 initial + 5 revisions
const CUSTOM_DESIGN_BASE_FEE = 25;       // Full custom base
const CUSTOM_INCLUDED_PROOFS = 3;        // 1 initial + 2 revisions TOTAL
const EXTRA_REVISION_FEE = 10;           // $10 per extra run beyond included

const PH_RECT = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="%23eeeeee"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="32" fill="%23999">Upload image</text></svg>';
const PH_CIRCLE = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><clipPath id="c"><circle cx="400" cy="400" r="360"/></clipPath></defs><rect width="100%" height="100%" fill="%23f2f4ff"/><g clip-path="url(%23c)"><rect width="100%" height="100%" fill="%23dde5ff"/></g><circle cx="400" cy="400" r="360" fill="none" stroke="%239eb6ff" stroke-width="6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="28" fill="%23666">Upload image</text></svg>';

async function callIdeaAPI(prompt: string, assets: File[]): Promise<string[]> {
  try {
    const fd = new FormData(); fd.append('prompt', prompt); assets.forEach(f=>fd.append('assets', f));
    const res = await fetch('/api/generate', { method: 'POST', body: fd });
    const data = await res.json(); if (Array.isArray(data.images)) return data.images as string[];
  } catch {}
  return [];
}

export default function Page() {
  const [step, setStep] = useState<1|2|3|4|5>(1);
  const [sheetKey, setSheetKey] = useState<SheetKey>('wafer_8x11');
  const [layout, setLayout] = useState<LayoutChoice|null>(null);
  const [safeMarginIn, setSafeMarginIn] = useState(0.5);

  const [items, setItems] = useState<ImgItem[]>([]);
  const [selectedId, setSelectedId] = useState<string|null>(null);

  const [needsDesignHelp, setNeedsDesignHelp] = useState(false);
  const [designMode, setDesignMode] = useState<'ai'|'custom'|null>(null);
  const [designPrompt, setDesignPrompt] = useState('');
  const [designAssets, setDesignAssets] = useState<File[]>([]);
  const [ideaImages, setIdeaImages] = useState<string[]>([]);
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [aiGeneratesUsed, setAiGeneratesUsed] = useState(0);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [rush, setRush] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [designFee, setDesignFee] = useState(0);

  const [printPreviewOn, setPrintPreviewOn] = useState(false);

  // Customer & submit
  const [customer, setCustomer] = useState({
    name: '', email: '', phone: '', pickup: true,
    pickupLocation: 'Greece, NY',
    address: { line1: '', line2: '', city: '', state: '', zip: '' },
    desiredDateTime: '', notes: '',
    agreePersonalUse: false, agreeNoRefunds: false,
  });
  const [shipZip, setShipZip] = useState('');
  const [shipEstimate, setShipEstimate] = useState<number|null>(null);
  const [placing, setPlacing] = useState(false);
  const [orderId, setOrderId] = useState<string|null>(null);

  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const sheet = SHEETS[sheetKey];
  const px = useMemo(() => ({ w: Math.round(sheet.inches.w*DPI), h: Math.round(sheet.inches.h*DPI), margin: Math.round(safeMarginIn*DPI) }), [sheet.inches.w, sheet.inches.h, safeMarginIn]);

  const PRESETS: LayoutChoice[] = [
    { kind: 'grid', sizeIn: 1.5, shape: 'circle', label: '1.5" rounds (max)' },
    { kind: 'grid', sizeIn: 2, shape: 'circle', label: '2" rounds (max)' },
    { kind: 'grid', sizeIn: 3, shape: 'circle', label: '3" rounds (max)' },
    { kind: 'round_center', diamIn: 6.75, label: '6.75" cake top (center)' },
    { kind: 'full_sheet', label: 'Full sheet (fit in safe)' },
  ];

  function selectedImageInfo() { const sel = items.find(i=>i.id===selectedId) || items[0]; return sel ? { src: sel.src, natW: sel.natW, natH: sel.natH } : undefined; }

  function addUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => { const img = new Image(); img.onload = () => {
      const ar = img.width/img.height; const wIn = 4, hIn = 4/ar;
      const it: ImgItem = { id: Math.random().toString(36).slice(2), src: reader.result as string, natW: img.width, natH: img.height, wIn, hIn, xIn: safeMarginIn, yIn: safeMarginIn, rotation: 0, lockAspect: true, shape: 'rect' };
      setItems(p=>[...p, it]); setSelectedId(it.id);
    }; img.src = reader.result as string; };
    reader.readAsDataURL(file);
  }

  function filterForSheet(key: SheetKey, enabled: boolean): string {
    if (!enabled) return 'none';
    return key==='wafer_8x11' ? 'saturate(0.85) contrast(0.92) brightness(1.03)' : 'saturate(1.05) contrast(1.06)';
  }

  useEffect(()=>{
    const c = canvasRef.current; if (!c) return; c.width = px.w; c.height = px.h; const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0,0,px.w,px.h);
    ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2446d6'; ctx.lineWidth = 6; ctx.beginPath(); ctx.rect(0,0,px.w,px.h); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.strokeStyle = '#9eb6ff'; (ctx as any).setLineDash?.([10,8]); ctx.lineWidth = 2; ctx.strokeRect(px.margin, px.margin, px.w-2*px.margin, px.h-2*px.margin); ctx.restore();

    if (!layout) { ctx.save(); ctx.fillStyle = '#64748b'; ctx.textAlign = 'center'; ctx.font = `${Math.max(16, Math.round(px.w*0.03))}px system-ui`; ctx.fillText('Choose a layout in Step 2', px.w/2, px.h/2-10); ctx.font = `${Math.max(12, Math.round(px.w*0.02))}px system-ui`; ctx.fillText('Then add artwork in Step 3', px.w/2, px.h/2+20); ctx.restore(); return; }

    (ctx as any).filter = filterForSheet(sheetKey, printPreviewOn);

    const info = selectedImageInfo();
    const areaW = sheet.inches.w - 2*safeMarginIn; const areaH = sheet.inches.h - 2*safeMarginIn;

    if (layout.kind==='full_sheet') { const aspect = info ? info.natW/info.natH : 1; const { wIn, hIn } = containFit(aspect, areaW, areaH); const xIn = safeMarginIn + (areaW-wIn)/2; const yIn = safeMarginIn + (areaH-hIn)/2; drawImageRect(ctx, info?.src || PH_RECT, xIn, yIn, wIn, hIn, 0, 'rect'); }
    if (layout.kind==='round_center') { const d = layout.diamIn; const xIn = (sheet.inches.w-d)/2; const yIn = (sheet.inches.h-d)/2; drawImageRect(ctx, info?.src || PH_CIRCLE, xIn, yIn, d, d, 0, 'circle'); }
    if (layout.kind==='grid') {
      const { cols, rows, step, offsetX, offsetY } = computeGridLayout({ sheetW: sheet.inches.w, sheetH: sheet.inches.h, margin: safeMarginIn, sizeIn: layout.sizeIn, gapIn: 0.1 });
      const src = info?.src || (layout.shape==='circle' ? PH_CIRCLE : PH_RECT);
      for (let r=0;r<rows;r++){ for (let c=0;c<cols;c++){ const xIn = offsetX + c*step; const yIn = offsetY + r*step; drawImageRect(ctx, src, xIn, yIn, layout.sizeIn, layout.sizeIn, 0, layout.shape); }}
    }
  }, [layout, items, sheetKey, sheet.inches.w, sheet.inches.h, safeMarginIn, px.w, px.h, px.margin, printPreviewOn]);

  function drawImageRect(ctx: CanvasRenderingContext2D, src: string, xIn: number, yIn: number, wIn: number, hIn: number, rot: number, shape: Shape){
    const img = new Image(); img.src = src; const x = Math.round(xIn*DPI), y = Math.round(yIn*DPI), w = Math.round(wIn*DPI), h = Math.round(hIn*DPI);
    ctx.save(); ctx.translate(x + w/2, y + h/2); ctx.rotate((rot*Math.PI)/180); if (shape==='circle'){ ctx.beginPath(); ctx.arc(0,0,Math.min(w,h)/2,0,Math.PI*2); ctx.clip(); } ctx.drawImage(img, -w/2, -h/2, w, h); ctx.restore();
  }

  function previewDataUrlJpegScaled(maxW=1400) {
    const c = canvasRef.current; if (!c) return '';
    const scale = Math.min(1, maxW / c.width);
    if (scale >= 0.999) return c.toDataURL('image/jpeg', 0.7);
    const off = document.createElement('canvas'); off.width = Math.round(c.width*scale); off.height = Math.round(c.height*scale);
    const octx = off.getContext('2d')!; octx.drawImage(c, 0, 0, off.width, off.height);
    return off.toDataURL('image/jpeg', 0.7);
  }

  function addCurrentToCart(){ if (!layout) return; const line: CartLine = { id: Math.random().toString(36).slice(2), sheetKey, layout, previewDataUrl: previewDataUrlJpegScaled(1200), qty: 1, rush, cutting, designFee }; setCart(p=>[...p, line]); setRush(false); setCutting(false); setDesignFee(0); setStep(1); setLayout(null); setItems([]); setSelectedId(null); setNeedsDesignHelp(false); setIdeaImages([]); setDesignAssets([]); setDesignPrompt(''); setAiGeneratesUsed(0); }

  function linePrice(line: CartLine){ const extras = (line.rush?15:0) + (line.cutting?5:0) + (line.designFee||0); return line.qty*BASE_PRICE_PER_SHEET + extras; }
  const cartSubtotal = cart.reduce((s,l)=> s + linePrice(l), 0);

  async function estimateShipping(totalSheets: number, zip: string){ try { const res = await fetch('/api/ship/estimate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ zip, sheets: totalSheets }) }); const data = await res.json(); if (res.ok && typeof data.estimate === 'number') return data.estimate; } catch {} return 0; }

  const canNextFrom1 = !!sheetKey; const canNextFrom2 = !!layout; const canNextFrom3 = needsDesignHelp ? (designMode==='ai' ? (aiGeneratesUsed>0 || !!designPrompt || designAssets.length>0 || ideaImages.length>0) : designMode==='custom' ? (!!designPrompt || designAssets.length>0) : false) : items.length>0;

  async function placeOrder(){
    if (!customer.name || !customer.email) { alert('Please enter your name and email.'); return; }
    if (!customer.pickup && !customer.address.line1) { alert('Please enter your shipping address.'); return; }
    if (!customer.agreePersonalUse || !customer.agreeNoRefunds) { alert('Please agree to the terms to proceed.'); return; }
    if (cart.length===0) { alert('Your cart is empty.'); return; }

    const subtotal = cartSubtotal;
    const shipping = shipEstimate || 0;
    const order = {
      customer: {
        name: customer.name, email: customer.email, phone: customer.phone, pickup: customer.pickup,
        pickupLocation: customer.pickup ? customer.pickupLocation : undefined,
        address: customer.pickup ? undefined : customer.address,
        desiredDateTime: customer.desiredDateTime,
        notes: customer.notes,
      },
      proof: { approved: true, thumb: cart[0]?.previewDataUrl || '' },
      totals: { subtotal, shipping, grandTotal: subtotal + shipping },
      design: {
        mode: needsDesignHelp ? (designMode==='ai' ? 'AI' : 'Custom') : 'None',
        aiIncludedRuns: AI_INCLUDED_GENERATES,
        aiRunsUsed: aiGeneratesUsed,
        prompt: designPrompt,
        assets: designAssets.map(f=>f.name),
      },
      lines: cart.map(l=> ({ sheetKey: l.sheetKey, layout: l.layout, qty: l.qty, rush: l.rush, cutting: l.cutting, designFee: l.designFee, previewDataUrl: l.previewDataUrl })),
    } as const;

    try {
      setPlacing(true);
      const res = await fetch('/api/order', { method:'POST', headers:{ 'Content-Type': 'application/json' }, body: JSON.stringify(order) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error==='string'? data.error : 'Order failed');
      setOrderId(data.id || 'unknown');
    } catch (e: any) { alert(e?.message || 'Order failed'); }
    finally { setPlacing(false); }
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <header className="rounded-2xl border bg-gradient-to-b from-indigo-50 to-white p-5 sm:p-8 mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-1">Edible Image Ordering</h1>
          <p className="text-gray-700">Follow the steps to build your sheet(s). Your review screen is the proof — I print exactly what you approve.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Wizard */}
          <section className="lg:col-span-2 flex flex-col gap-4">
            <Stepper step={step} setStep={setStep} can={{ s1: canNextFrom1, s2: canNextFrom2, s3: canNextFrom3 }} />

            {/* Step 1 */}
            {step===1 && (
              <div className="border rounded-2xl p-4">
                <h2 className="text-lg font-medium mb-2">1. Choose sheet type</h2>
                <div className="flex flex-wrap gap-3 items-center">
                  <select className="border rounded px-3 py-2" value={sheetKey} onChange={e=>setSheetKey(e.target.value as SheetKey)}>
                    {Object.entries(SHEETS).map(([k,v])=> <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <label className="text-sm ml-2">Safe margin (in)
                    <input type="number" min={0} max={1} step={0.125} value={safeMarginIn} onChange={e=>setSafeMarginIn(parseFloat(e.target.value||'0'))} className="ml-2 border rounded px-2 py-1 w-24" />
                  </label>
                </div>
                <div className="mt-3 text-sm text-gray-600">Wafer: thin, softer color; keep dry. Frosting: richer color; avoid heat. $10 per sheet, whole sheets only. Cutting & design are extra.</div>
                <div className="mt-4 flex justify-end"><button disabled={!canNextFrom1} onClick={()=>setStep(2)} className="px-4 py-2 rounded-lg border bg-indigo-600 text-white disabled:opacity-50">Next</button></div>
              </div>
            )}

            {/* Step 2 */}
            {step===2 && (
              <div className="border rounded-2xl p-4">
                <h2 className="text-lg font-medium mb-4">2. Choose layout</h2>

                {/* Mobile-first layout with preview on top */}
                <div className="space-y-4">
                  {/* Preview Section - Shows immediately on mobile */}
                  <div className="lg:hidden">
                    <PreviewCanvas canvasRef={canvasRef} sheetKey={sheetKey} safeMarginIn={safeMarginIn} layout={layout} items={items} />
                  </div>

                  {/* Layout Selection */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => setLayout(p)}
                        className={`text-left border-2 rounded-xl p-4 transition-all hover:shadow-md ${
                          layout === p
                            ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                            : 'border-gray-200 hover:border-indigo-300'
                        }`}
                        type="button"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {p.kind === 'grid' && p.shape === 'circle' && <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold">●●</div>}
                            {p.kind === 'round_center' && <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 text-xs font-bold">⬤</div>}
                            {p.kind === 'full_sheet' && <div className="w-8 h-8 bg-amber-100 rounded flex items-center justify-center text-amber-600 text-xs font-bold">▬</div>}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{p.label}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {p.kind === 'grid' && `${p.sizeIn}" ${p.shape}s, auto-arranged`}
                              {p.kind === 'round_center' && `${p.diamIn}" diameter, centered`}
                              {p.kind === 'full_sheet' && 'Fits entire safe area'}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Selection Confirmation */}
                  {layout && (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-indigo-900">Selected:</span>
                        <span className="text-indigo-700">{layout.label}</span>
                        {layout.kind === 'grid' && (
                          <span className="text-indigo-600">• {layout.sizeIn}" {layout.shape}s</span>
                        )}
                        {layout.kind === 'round_center' && (
                          <span className="text-indigo-600">• {layout.diamIn}" diameter</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Preview for desktop (hidden on mobile) */}
                  <div className="hidden lg:block">
                    <PreviewCanvas canvasRef={canvasRef} sheetKey={sheetKey} safeMarginIn={safeMarginIn} layout={layout} items={items} />
                  </div>
                </div>

                <div className="mt-6 flex justify-between items-center">
                  <button onClick={()=>setStep(1)} className="px-3 py-2 rounded-lg border" type="button">Back</button>
                  <button disabled={!canNextFrom2} onClick={()=>setStep(3)} className="px-4 py-2 rounded-lg border bg-indigo-600 text-white disabled:opacity-50" type="button">Next</button>
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step===3 && (
              <div className="border rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-medium">3. Add your artwork</h2>
                  {layout && (
                    <div className="text-sm text-gray-600 bg-gray-50 px-3 py-1 rounded-full">
                      Layout: <span className="font-medium text-gray-800">{layout.label}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2"><input type="radio" name="artmode" checked={!needsDesignHelp} onChange={()=>{ setNeedsDesignHelp(false); setDesignMode(null); }} /> I have finished images</label>
                  <label className="flex items-center gap-2"><input type="radio" name="artmode" checked={needsDesignHelp} onChange={()=> setNeedsDesignHelp(true)} /> I need design help</label>
                  <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={printPreviewOn} onChange={e=>setPrintPreviewOn(e.target.checked)} /> Show realistic print preview</label>
                </div>

                {!needsDesignHelp && (
                  <div className="mt-3">
                    <ImageUploadArea onFilesAdded={(files) => files.forEach(addUpload)} />
                    <div className="text-xs text-gray-600 mt-2">Toggle "realistic preview" to simulate wafer vs frosting colors/contrast.</div>
                  </div>
                )}

                {needsDesignHelp && (
                  <div className="mt-3 grid gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2"><input type="radio" name="desmode" checked={designMode==='ai'} onChange={()=>setDesignMode('ai')} /> Generate ideas for me now (AI-assisted, +${AI_DESIGN_BASE_FEE})</label>
                      <label className="flex items-center gap-2"><input type="radio" name="desmode" checked={designMode==='custom'} onChange={()=>setDesignMode('custom')} /> Work with Kristen (Full custom, +${CUSTOM_DESIGN_BASE_FEE})</label>
                    </div>
                    <textarea className="border rounded p-2 min-h-[100px]" value={designPrompt} onChange={e=>setDesignPrompt(e.target.value)} placeholder="Describe your idea (e.g., wafer-over-frosting burn reveal; same font with 12 names)" />
                    <input type="file" multiple onChange={e=>setDesignAssets(Array.from(e.target.files||[]))} />

                    {designMode==='ai' && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                          <button disabled={ideaLoading || aiGeneratesUsed>=AI_INCLUDED_GENERATES} onClick={async()=>{ if (aiGeneratesUsed>=AI_INCLUDED_GENERATES) return; setIdeaLoading(true); const imgs = await callIdeaAPI(designPrompt, designAssets); setIdeaImages(imgs); setIdeaLoading(false); setAiGeneratesUsed(v=>v+1); }} className="px-3 py-2 rounded-lg border bg-emerald-600 text-white disabled:opacity-50">Generate ideas ({aiGeneratesUsed}/{AI_INCLUDED_GENERATES})</button>
                          {ideaLoading && <span className="text-sm">Generating…</span>}
                        </div>
                        {aiGeneratesUsed>=AI_INCLUDED_GENERATES && (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">You’ve used the included {AI_INCLUDED_GENERATES} runs. Need more? Each additional round is ${EXTRA_REVISION_FEE}.</div>
                        )}
                      </div>
                    )}

                    {ideaImages.length>0 && (
                      <div className="grid sm:grid-cols-3 gap-3 mt-2">
                        {ideaImages.map((src,i)=> (
                          <div key={i} className="border rounded-lg p-2">
                            <img src={src} alt={`Idea ${i+1}`} className="w-full h-32 object-cover rounded" />
                            <button onClick={()=>{ const it: ImgItem = { id: Math.random().toString(36).slice(2), src, natW: 1200, natH: 800, wIn: 4, hIn: 4*(800/1200), xIn: safeMarginIn, yIn: safeMarginIn, rotation: 0, lockAspect: true, shape: 'rect' }; setItems([it]); setSelectedId(it.id); }} className="mt-2 w-full px-2 py-1 rounded border">Use this</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {designMode==='custom' && (
                      <div className="text-xs text-gray-700">Full custom by Kristen includes <b>{CUSTOM_INCLUDED_PROOFS-1}</b> revisions beyond the initial. Extra rounds ${EXTRA_REVISION_FEE} each.</div>
                    )}

                    <div className="text-xs text-gray-600">When “realistic preview” is on, wafer appears softer/lower contrast; frosting richer. Colors on screen are an approximation.</div>
                  </div>
                )}

                <div className="mt-4">
                  <PreviewCanvas canvasRef={canvasRef} sheetKey={sheetKey} safeMarginIn={safeMarginIn} layout={layout} items={items} />
                </div>

                <div className="mt-4 flex flex-wrap gap-3 items-center">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={rush} onChange={e=>setRush(e.target.checked)} /> Rush (+$15)</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={cutting} onChange={e=>setCutting(e.target.checked)} /> Pre-cut (+$5)</label>
                  {needsDesignHelp && designMode==='ai' && (
                    <label className="flex items-center gap-2">Design fee ($)
                      <input type="number" min={AI_DESIGN_BASE_FEE} step={5} value={designFee || AI_DESIGN_BASE_FEE} onChange={e=>setDesignFee(parseFloat(e.target.value||String(AI_DESIGN_BASE_FEE)))} className="border rounded px-2 py-1 w-24" />
                    </label>
                  )}
                  {needsDesignHelp && designMode==='custom' && (
                    <label className="flex items-center gap-2">Custom design fee ($)
                      <input type="number" min={CUSTOM_DESIGN_BASE_FEE} step={5} value={designFee || CUSTOM_DESIGN_BASE_FEE} onChange={e=>setDesignFee(parseFloat(e.target.value||String(CUSTOM_DESIGN_BASE_FEE)))} className="border rounded px-2 py-1 w-28" />
                    </label>
                  )}
                </div>

                <div className="mt-4 flex justify-between items-center">
                  <button onClick={()=>setStep(2)} className="px-3 py-2 rounded-lg border">Back</button>
                  <button disabled={!canNextFrom3} onClick={()=>setStep(4)} className="px-4 py-2 rounded-lg border bg-indigo-600 text-white disabled:opacity-50">Next</button>
                </div>
              </div>
            )}

            {/* Step 4 */}
            {step===4 && (
              <div className="border rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-medium">4. Review & approve (this is your proof)</h2>
                  {layout && (
                    <div className="text-sm text-gray-600 bg-gray-50 px-3 py-1 rounded-full">
                      Layout: <span className="font-medium text-gray-800">{layout.label}</span>
                    </div>
                  )}
                </div>
                <div className="text-sm text-gray-700 mb-2">I will print exactly what you see here within the safe margin box.</div>
                <div className="flex items-center gap-3 mb-2 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={printPreviewOn} onChange={e=>setPrintPreviewOn(e.target.checked)} /> Show realistic print preview</label>
                  <span className="text-gray-500">(Wafer looks softer; Frosting looks richer)</span>
                </div>
                <div className="rounded-xl border p-3 bg-slate-50"><img src={previewDataUrlJpegScaled(1200)} alt="Sheet preview" className="w-full max-w-xl rounded mx-auto" /></div>
                <div className="mt-4 flex justify-between items-center">
                  <button onClick={()=>setStep(3)} className="px-3 py-2 rounded-lg border">Back</button>
                  <button onClick={addCurrentToCart} className="px-4 py-2 rounded-lg border bg-emerald-600 text-white">Add this sheet to cart</button>
                </div>
              </div>
            )}

            {/* Step 5: Customer & Submit */}
            {step===5 && (
              <div className="border rounded-2xl p-4">
                <h2 className="text-lg font-medium mb-2">5. Customer info & submit</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  <input className="border rounded px-3 py-2" placeholder="Full name" value={customer.name} onChange={e=>setCustomer({...customer, name: e.target.value})} />
                  <input className="border rounded px-3 py-2" placeholder="Email" value={customer.email} onChange={e=>setCustomer({...customer, email: e.target.value})} />
                  <input className="border rounded px-3 py-2" placeholder="Phone" value={customer.phone} onChange={e=>setCustomer({...customer, phone: e.target.value})} />
                  <input className="border rounded px-3 py-2" placeholder="Desired date/time (optional)" value={customer.desiredDateTime} onChange={e=>setCustomer({...customer, desiredDateTime: e.target.value})} />
                  <textarea className="border rounded px-3 py-2 sm:col-span-2" placeholder="Notes (optional)" value={customer.notes} onChange={e=>setCustomer({...customer, notes: e.target.value})} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2"><input type="radio" name="deliv" checked={customer.pickup} onChange={()=>setCustomer({...customer, pickup: true})} /> Local pickup (Greece, NY)</label>
                  <label className="flex items-center gap-2"><input type="radio" name="deliv" checked={!customer.pickup} onChange={()=>setCustomer({...customer, pickup: false})} /> Ship to me</label>
                </div>

                {!customer.pickup && (
                  <div className="grid sm:grid-cols-2 gap-3 mt-2">
                    <input className="border rounded px-3 py-2 sm:col-span-2" placeholder="Address line 1" value={customer.address.line1} onChange={e=>setCustomer({...customer, address: {...customer.address, line1: e.target.value}})} />
                    <input className="border rounded px-3 py-2 sm:col-span-2" placeholder="Address line 2" value={customer.address.line2} onChange={e=>setCustomer({...customer, address: {...customer.address, line2: e.target.value}})} />
                    <input className="border rounded px-3 py-2" placeholder="City" value={customer.address.city} onChange={e=>setCustomer({...customer, address: {...customer.address, city: e.target.value}})} />
                    <input className="border rounded px-3 py-2" placeholder="State" value={customer.address.state} onChange={e=>setCustomer({...customer, address: {...customer.address, state: e.target.value}})} />
                    <input className="border rounded px-3 py-2" placeholder="ZIP" value={customer.address.zip} onChange={e=>setCustomer({...customer, address: {...customer.address, zip: e.target.value}})} />
                  </div>
                )}

                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm"><input type="checkbox" checked={customer.agreePersonalUse} onChange={e=>setCustomer({...customer, agreePersonalUse: e.target.checked})} /> I confirm images are for personal use only.</div>
                  <div className="flex items-center gap-2 text-sm"><input type="checkbox" checked={customer.agreeNoRefunds} onChange={e=>setCustomer({...customer, agreeNoRefunds: e.target.checked})} /> I understand no refunds after proof approval.</div>
                </div>

                {!customer.pickup && (
                  <div className="mt-3 flex items-center gap-2">
                    <input value={shipZip} onChange={e=>setShipZip(e.target.value)} placeholder="ZIP code" className="border rounded px-2 py-1 w-28" />
                    <button className="px-3 py-2 rounded-lg border" onClick={async()=>{ const sheets = cart.reduce((n,l)=>n+l.qty,0); const est = await estimateShipping(sheets, shipZip); setShipEstimate(est); }}>Estimate USPS</button>
                    {shipEstimate!==null && <span className="text-sm ml-2">Estimated shipping: ${shipEstimate.toFixed(2)}</span>}
                  </div>
                )}

                <div className="mt-4 flex justify-between items-center">
                  <button onClick={()=>setStep(4)} className="px-3 py-2 rounded-lg border">Back</button>
                  <button disabled={placing} onClick={placeOrder} className="px-4 py-2 rounded-lg border bg-indigo-600 text-white disabled:opacity-50">{placing?'Placing…':'Place order'}</button>
                </div>

                {orderId && (
                  <div className="mt-4 border rounded-xl p-3 bg-emerald-50 text-emerald-800">
                    Order received! Your reference ID: <b>{orderId}</b>. You can now pay via Venmo/Cash App. Thank you!
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <a className="px-3 py-2 rounded-lg border bg-indigo-600 text-white text-center" href="https://venmo.com/PLACED_YOUR_HANDLE" target="_blank" rel="noreferrer">Pay with Venmo</a>
                      <a className="px-3 py-2 rounded-lg border text-center" href="https://cash.app/$PLACE_YOUR_CASH_TAG" target="_blank" rel="noreferrer">Pay with Cash App</a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Cart */}
          <aside className="lg:col-span-1 border rounded-2xl p-4 h-max sticky top-4">
            <h3 className="text-lg font-medium">Your Cart</h3>
            {cart.length===0 && <div className="text-sm text-gray-600 mt-2">No items yet. Build a sheet and add it here.</div>}
            {cart.map(line => (
              <div key={line.id} className="mt-3 border rounded-xl p-3">
                <img src={line.previewDataUrl} alt="preview" className="w-full rounded" />
                <div className="mt-2 text-sm">
                  <div className="font-medium">{SHEETS[line.sheetKey].label}</div>
                  <div className="text-gray-600">{('label' in line.layout) ? line.layout.label : (line.layout as any).kind}</div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-sm">Qty</label>
                  <input type="number" min={1} max={MAX_QTY_PER_LINE} value={line.qty} onChange={e=>{
                    let v = parseInt(e.target.value||'1', 10); if (isNaN(v)||v<1) v=1; if (v>MAX_QTY_PER_LINE) v=MAX_QTY_PER_LINE;
                    setCart(p=>p.map(x=> x.id===line.id ? { ...x, qty: v } : x));
                  }} className="border rounded px-2 py-1 w-20" />
                </div>
                <div className="mt-2 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={line.rush} onChange={e=>setCart(p=>p.map(x=>x.id===line.id?{...x, rush: e.target.checked}:x))} /> Rush (+$15)</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={line.cutting} onChange={e=>setCart(p=>p.map(x=>x.id===line.id?{...x, cutting: e.target.checked}:x))} /> Pre-cut (+$5)</label>
                  {line.designFee !== undefined && (
                    <label className="flex items-center gap-2 mt-1">Design fee ($)
                      <input type="number" min={0} step={5} value={line.designFee} onChange={e=>setCart(p=>p.map(x=>x.id===line.id?{...x, designFee: parseFloat(e.target.value||'0')}:x))} className="border rounded px-2 py-1 w-24" />
                    </label>
                  )}
                </div>
                <div className="mt-2 font-medium">Line total: ${linePrice(line).toFixed(2)}</div>
                <button onClick={()=>setCart(p=>p.filter(x=>x.id!==line.id))} className="mt-2 w-full px-3 py-2 rounded-lg border">Remove</button>
              </div>
            ))}

            {cart.length>0 && (
              <div className="mt-4 border-t pt-3">
                <div className="flex justify-between text-sm"><span>Subtotal</span><span>${cartSubtotal.toFixed(2)}</span></div>
                <div className="text-xs text-gray-600 mt-1">Shipping calculated at submit. Local pickup in Greece, NY available.</div>
                <div className="mt-3 flex justify-between">
                  <button onClick={()=>setStep(5)} className="px-3 py-2 rounded-lg border bg-indigo-600 text-white">Checkout</button>
                </div>
              </div>
            )}
          </aside>
        </div>

        <footer className="text-center text-xs text-gray-600 mt-6">© {new Date().getFullYear()} Edible Images by Kristen — Greece, NY. Nationwide USPS shipping available. Personal-use only on licensed art. No refunds after proof approval.</footer>
      </div>
    </div>
  );
}

function Stepper({ step, setStep, can }: { step: 1|2|3|4|5; setStep: (s:any)=>void; can:{ s1:boolean; s2:boolean; s3:boolean } }) {
  const steps = ['Type','Layout','Artwork','Review','Customer'];
  return (
    <div className="flex items-center gap-2 select-none">
      {steps.map((label,i)=>{
        const n = (i+1) as 1|2|3|4|5;
        const enabled = n < step ? true : n === step ? true : (n===2?can.s1:n===3?can.s2:n===4?can.s3:true);
        return (
          <button key={i} disabled={!enabled} onClick={()=> enabled && setStep(n)} className={`px-3 py-1.5 rounded-full text-sm border ${n===step?'bg-indigo-600 text-white': enabled? 'bg-white':'opacity-40'}`}>{i+1}. {label}</button>
        );
      })}
    </div>
  );
}

function PreviewCanvas({ canvasRef, sheetKey, safeMarginIn, layout, items }:
  { canvasRef: React.RefObject<HTMLCanvasElement>; sheetKey: SheetKey; safeMarginIn?: number; layout?: any; items?: any[]; }) {
  const s = SHEETS[sheetKey];
  const w = Math.round(s.inches.w * DPI), h = Math.round(s.inches.h * DPI);

  // Fixed, consistent sizing that matches other page components
  const containerWidth = 600; // Match the main content width
  const maxHeight = 400; // Reasonable height for all devices

  // Calculate scale to fit nicely within consistent container size
  const scaleX = (containerWidth - 48) / w; // Account for padding
  const scaleY = maxHeight / h;
  const scale = Math.min(scaleX, scaleY, 1); // Never scale up beyond 100%

  return (
    <div className="border rounded-xl bg-slate-100 p-6 w-full max-w-3xl mx-auto">
      <div className="flex justify-center items-center" style={{ minHeight: `${Math.min(h * scale + 40, maxHeight)}px` }}>
        <div className="inline-block" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
          <canvas
            ref={canvasRef}
            width={w}
            height={h}
            className="bg-white shadow-lg"
            aria-label="Sheet preview canvas"
            style={{
              outline: '3px solid #2446d6',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15), 0 0 0 6px rgba(36,70,214,0.08) inset',
              borderRadius: '6px'
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ImageUploadArea({ onFilesAdded }: { onFilesAdded: (files: File[]) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (files.length > 0) onFilesAdded(files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onFilesAdded(files);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
        isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <div className="space-y-3">
        <div className="text-4xl">📁</div>
        <div className="text-lg font-medium text-gray-700">
          {isDragging ? 'Drop your images here!' : 'Drop images here or click to browse'}
        </div>
        <div className="text-sm text-gray-500">
          Supports JPG, PNG, GIF, SVG, PDF • Multiple files OK
        </div>
        <button
          type="button"
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Choose Files
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
