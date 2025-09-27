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

    // Prepare order fields - comprehensive order data in Notes field
    const orderFields = {
      // Put all order information in Notes field (most likely to exist)
      Notes: [
        `=== ORDER ${Date.now()} ===`,
        `Status: NEW`,
        `Customer: ${order.customer?.name || 'Unknown'}`,
        `Email: ${order.customer?.email || 'no-email'}`,
        `Phone: ${order.customer?.phone || 'N/A'}`,
        `Delivery: ${order.customer?.pickup ? 'Pickup' : 'Shipping'}`,
        order.customer?.address?.line1 ? `Address: ${order.customer.address.line1}, ${order.customer.address.city || ''} ${order.customer.address.state || ''} ${order.customer.address.zip || ''}` : '',
        order.customer?.desiredDateTime ? `Desired Date/Time: ${order.customer.desiredDateTime}` : '',
        ``,
        `=== ORDER DETAILS ===`,
        `Subtotal: $${order.totals?.subtotal ?? 0}`,
        `Shipping: $${order.totals?.shipping ?? 0}`,
        `Total: $${order.totals?.grandTotal ?? 0}`,
        `Number of Sheets: ${numSheets}`,
        `Rush Order: ${anyRush ? 'Yes (+$15)' : 'No'}`,
        `Pre-cutting: ${anyCutting ? 'Yes (+$5)' : 'No'}`,
        `Sheet Types: ${sheetTypes}`,
        ``,
        `=== DESIGN INFO ===`,
        `Design Mode: ${order.design?.mode || 'None'}`,
        order.design?.prompt ? `Design Prompt: ${order.design.prompt}` : '',
        order.design?.assets?.length ? `Design Assets: ${order.design.assets.join(', ')}` : '',
        ``,
        `=== SHIPPING INFO ===`,
        order.shipping?.shipmentId ? `Shipment ID: ${order.shipping.shipmentId}` : '',
        order.shipping?.rateId ? `Rate ID: ${order.shipping.rateId}` : '',
        ``,
        `=== ORDER LINES (JSON) ===`,
        JSON.stringify(lines, null, 2),
        ``,
        order.customer?.notes ? `=== CUSTOMER NOTES ===\n${order.customer.notes}` : ''
      ].filter(Boolean).join('\n'),
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
