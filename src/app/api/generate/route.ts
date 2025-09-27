import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const prompt = String(form.get('prompt') || '');
    // const assets = form.getAll('assets') as File[];

    const images = [1,2,3].map(i =>
      `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>
          <rect width='100%' height='100%' fill='${i===1?'#fef3c7':i===2?'#d1fae5':'#e0e7ff'}'/>
          <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='system-ui' font-size='42' fill='#111'>Mock Idea ${i}</text>
          <text x='50%' y='62%' dominant-baseline='middle' text-anchor='middle' font-family='system-ui' font-size='20' fill='#333'>${prompt.replace(/</g,'&lt;')}</text>
        </svg>`
      )}`
    );

    return NextResponse.json({ images });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 });
  }
}
