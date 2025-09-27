interface AirtableFields {
  [key: string]: any;
}

interface AirtableRecord {
  fields: AirtableFields;
}

interface AirtableResponse {
  records: Array<{ id: string; fields: AirtableFields }>;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function airtableRequest(url: string, options: RequestInit, retries = 3): Promise<Response> {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error('Missing AIRTABLE_TOKEN');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '30');
        if (attempt < retries) {
          await sleep(retryAfter * 1000);
          continue;
        }
      }

      // Handle server errors with retry
      if (response.status >= 500 && attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000); // exponential backoff
        continue;
      }

      return response;
    } catch (error) {
      if (attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}

export async function createOrderRecord(fields: AirtableFields): Promise<string> {
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE || 'Orders';

  if (!base) throw new Error('Missing AIRTABLE_BASE_ID');

  const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;
  const response = await airtableRequest(url, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }] }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Airtable error: ${response.status} ${JSON.stringify(errorData)}`);
  }

  const data: AirtableResponse = await response.json();
  return data.records[0]?.id || 'unknown';
}

export async function upsertCustomer(name: string, email: string, phone?: string): Promise<string> {
  const base = process.env.AIRTABLE_BASE_ID;
  const customersTable = 'Customers'; // Assuming you have a Customers table

  if (!base) throw new Error('Missing AIRTABLE_BASE_ID');

  // First, try to find existing customer by email
  const searchUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent(customersTable)}?filterByFormula=${encodeURIComponent(`{Email} = "${email}"`)}`;

  try {
    const searchResponse = await airtableRequest(searchUrl, { method: 'GET' });

    if (searchResponse.ok) {
      const searchData: AirtableResponse = await searchResponse.json();
      if (searchData.records.length > 0) {
        return searchData.records[0].id; // Customer exists
      }
    }
  } catch (error) {
    // If search fails, continue to create new customer
    console.warn('Customer search failed, creating new customer');
  }

  // Create new customer
  const createUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent(customersTable)}`;
  const response = await airtableRequest(createUrl, {
    method: 'POST',
    body: JSON.stringify({
      records: [{
        fields: {
          Name: name,
          Email: email,
          Phone: phone || '',
          CreatedAt: new Date().toISOString(),
        }
      }]
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Customer creation error: ${response.status} ${JSON.stringify(errorData)}`);
  }

  const data: AirtableResponse = await response.json();
  return data.records[0]?.id || 'unknown';
}