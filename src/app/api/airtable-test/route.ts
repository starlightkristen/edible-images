import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const token = process.env.AIRTABLE_TOKEN;
    const base = process.env.AIRTABLE_BASE_ID;

    if (!token || !base) {
      return NextResponse.json({
        error: 'Missing Airtable credentials',
        token: token ? `${token.slice(0, 8)}...` : 'missing',
        base: base ? `${base.slice(0, 8)}...` : 'missing'
      }, { status: 400 });
    }

    // Try a simple GET request to the Orders table first
    const ordersUrl = `https://api.airtable.com/v0/${base}/Orders?maxRecords=1`;
    const ordersResponse = await fetch(ordersUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    let ordersResult: any = {};
    if (ordersResponse.ok) {
      ordersResult = { status: 'Orders table exists', data: await ordersResponse.json() };
    } else {
      const errorData = await ordersResponse.json().catch(() => ({}));
      ordersResult = { status: 'Orders table error', error: ordersResponse.status, data: errorData };
    }

    // Try to list tables in the base (this might not work with all token permissions)
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${base}/tables`;
    const metaResponse = await fetch(metaUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    let metaResult: any = {};
    if (metaResponse.ok) {
      const data = await metaResponse.json();
      metaResult = {
        success: true,
        tables: data.tables?.map((t: any) => ({
          id: t.id,
          name: t.name,
          fieldCount: t.fields?.length || 0
        })) || []
      };
    } else {
      const errorData = await metaResponse.json().catch(() => ({}));
      metaResult = { error: 'Meta API not accessible', status: metaResponse.status, data: errorData };
    }

    return NextResponse.json({
      base: `${base.slice(0, 8)}...`,
      token: `${token.slice(0, 8)}...`,
      ordersTable: ordersResult,
      metaAPI: metaResult
    });
  } catch (e: any) {
    return NextResponse.json({
      error: 'Internal error',
      message: e?.message
    }, { status: 500 });
  }
}