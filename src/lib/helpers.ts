export const DPI = 300;

export function containFit(aspectRatio: number, areaW: number, areaH: number) {
  let wIn = areaW; let hIn = wIn / aspectRatio;
  if (hIn > areaH) { hIn = areaH; wIn = hIn * aspectRatio; }
  return { wIn, hIn };
}

export function capacityFor({ sheetW, sheetH, margin, sizeIn, gapIn = 0.1 }:
  { sheetW: number; sheetH: number; margin: number; sizeIn: number; gapIn?: number; }) {
  const areaW = sheetW - 2*margin; const areaH = sheetH - 2*margin;
  const step = sizeIn + gapIn;
  const cols = Math.max(1, Math.floor((areaW + gapIn) / step));
  const rows = Math.max(1, Math.floor((areaH + gapIn) / step));
  return { cols, rows, capacity: cols*rows };
}

export function computeGridLayout({ sheetW, sheetH, margin, sizeIn, gapIn = 0.1 }:
  { sheetW: number; sheetH: number; margin: number; sizeIn: number; gapIn?: number; }) {
  const { cols, rows } = capacityFor({ sheetW, sheetH, margin, sizeIn, gapIn });
  const areaW = sheetW - 2*margin; const areaH = sheetH - 2*margin;
  const step = sizeIn + gapIn;
  const totalW = cols * sizeIn + (cols - 1) * gapIn;
  const totalH = rows * sizeIn + (rows - 1) * gapIn;
  const offsetX = margin + Math.max(0, (areaW - totalW) / 2);
  const offsetY = margin + Math.max(0, (areaH - totalH) / 2);
  return { cols, rows, step, offsetX, offsetY };
}

// Helper functions for backend
export function getClientIP(req: Request): string {
  const headers = req.headers;
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function sanitizeString(str: string, maxLength: number = 255): string {
  return str.trim().slice(0, maxLength);
}
