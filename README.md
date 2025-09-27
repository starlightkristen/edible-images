# Edible Images Wizard

A Next.js application for creating custom edible image orders with shipping estimates.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AIRTABLE_TOKEN` | Airtable API token (pat_xxx) | Yes |
| `AIRTABLE_BASE_ID` | Airtable base ID (app7MFq3Lx27RY56f) | Yes |
| `AIRTABLE_TABLE` | Airtable table name (default: Orders) | No |
| `RENDER_SHIP_URL` | Render shipping service URL | Yes* |
| `RENDER_BEARER` | Render service bearer token | Yes* |

*Required for production shipping rates. App uses mock rates in development.

## API Endpoints

### POST /api/order - Creates a new order
### POST /api/ship/estimate - Gets shipping rates  
### GET /api/health - Health check

## Development
```bash
npm install
npm run dev
```

## What Happens in Airtable After Order Creation

1. A new record is created in the Orders table
2. LinesJSON field contains complete line items
3. Airtable automations explode LinesJSON into Order Lines records
4. Order status set to NEW awaiting processing
