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

    if (renderUrl && renderUrl !== 'https://your-render-service.onrender.com') {
      // Transform request to match your service's format
      const shipRequest = {
        to: {
          name: rateRequest.to.name,
          street1: rateRequest.to.street1,
          city: rateRequest.to.city,
          state: rateRequest.to.state,
          zip: rateRequest.to.zip,
          email: rateRequest.to.email
        },
        parcel: {
          length: rateRequest.parcel.length,
          width: rateRequest.parcel.width,
          height: rateRequest.parcel.height,
          weight_oz: rateRequest.parcel.weight_oz
        },
        reference: `estimate-${Date.now()}`,
        options: {
          signature: null,
          perishable: false,
          delivery_confirmation: null
        }
      };

      try {
        // Note: Your service creates actual shipping labels, not just estimates
        // For rate estimates, we should use mock data to avoid creating real labels
        console.log('Rate estimate requested - using mock data to avoid creating actual shipping labels');
        // Fall through to mock response
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
