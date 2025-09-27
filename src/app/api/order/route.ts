import { NextRequest, NextResponse } from 'next/server';
import { zOrderPayload } from '@/lib/validators';
import { createOrderRecord, upsertCustomer } from '@/lib/airtable';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIP } from '@/lib/helpers';

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIP(req);
    const rateLimitResult = rateLimit(`order:${ip}`, 60, 60000);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          }
        }
      );
    }

    // Environment validation
    const token = process.env.AIRTABLE_TOKEN;
    const base = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_TABLE || 'Orders';
    if (!token || !base || token === 'pat_your_token_here' || token === 'pat_xxx' || base === 'app_xxx') {
      // Mock mode for development
      console.log('Running in mock mode - Airtable credentials not configured');
      const mockId = `rec${Date.now()}`;
      return NextResponse.json(
        { id: mockId, mock: true },
        {
          headers: {
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          }
        }
      );
    }

    // Parse and validate payload
    const body = await req.json();
    const validation = zOrderPayload.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: validation.error.issues },
        { status: 400 }
      );
    }

    const order = validation.data;

    // Upsert customer if we have sufficient info
    let customerId: string | undefined;
    try {
      if (order.customer.email && order.customer.name) {
        customerId = await upsertCustomer(
          order.customer.name,
          order.customer.email,
          order.customer.phone
        );
      }
    } catch (error) {
      console.warn('Customer upsert failed:', error);
    }

    // Derive analytics
    const lines = order.lines || [];
    const sheetTypes = Array.from(new Set(lines.map(l => l.sheetKey))).join(', ');
    const numSheets = lines.reduce((n, l) => n + (l.qty || 0), 0);
    const anyRush = lines.some(l => !!l.rush);
    const anyCutting = lines.some(l => !!l.cutting);

    // Prepare minimal order fields to test - start with almost nothing
    const orderFields = {
      // Only try the most basic field
      Notes: order.customer?.notes || `Order from ${order.customer?.name || 'Unknown'} (${order.customer?.email || 'no-email'}) - Total: $${order.totals?.grandTotal ?? 0}`,
    };

    // Create order record
    const id = await createOrderRecord(orderFields);

    return NextResponse.json(
      { id },
      {
        headers: {
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
        }
      }
    );
  } catch (e: any) {
    console.error('Order creation error:', e);
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
