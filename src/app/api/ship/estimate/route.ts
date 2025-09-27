import { NextRequest, NextResponse } from 'next/server';
import { zRateRequest } from '@/lib/validators';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIP } from '@/lib/helpers';

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIP(req);
    const rateLimitResult = rateLimit(`ship:${ip}`, 30, 60000);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '30',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          }
        }
      );
    }

    // Parse and validate payload
    const body = await req.json();
    const validation = zRateRequest.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: validation.error.issues },
        { status: 400 }
      );
    }

    const rateRequest = validation.data;

    // Check if Render service is configured
    const renderUrl = process.env.RENDER_SHIP_URL;
    const renderBearer = process.env.RENDER_BEARER;

    if (renderUrl && renderBearer && renderUrl !== 'https://your-render-service.onrender.com') {
      // Proxy to Render service
      try {
        const response = await fetch(`${renderUrl}/rate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${renderBearer}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(rateRequest),
        });

        const data = await response.json();

        if (!response.ok) {
          return NextResponse.json(data, { status: response.status });
        }

        return NextResponse.json(data, {
          headers: {
            'X-RateLimit-Limit': '30',
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          }
        });
      } catch (error) {
        console.error('Render service error:', error);
        // Fall through to mock response
      }
    }

    // Mock response for development/testing
    const mockShipmentId = `ship_${Date.now()}`;
    const mockRates = [
      {
        id: `rate_${Date.now()}_1`,
        service: 'USPS Priority Mail',
        rate: '8.50',
        delivery_days: 2,
        carrier: 'USPS'
      },
      {
        id: `rate_${Date.now()}_2`,
        service: 'USPS Ground Advantage',
        rate: '5.25',
        delivery_days: 5,
        carrier: 'USPS'
      }
    ];

    return NextResponse.json(
      {
        shipment_id: mockShipmentId,
        rates: mockRates
      },
      {
        headers: {
          'X-RateLimit-Limit': '30',
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
        }
      }
    );
  } catch (e: any) {
    console.error('Ship estimate error:', e);
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
