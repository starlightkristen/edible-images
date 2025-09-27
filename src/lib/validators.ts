import { z } from 'zod';

export const zOrderPayload = z.object({
  customer: z.object({
    name: z.string().optional(),
    email: z.string().email(),
    phone: z.string().optional(),
    pickup: z.boolean(),
    pickupLocation: z.string().optional(),
    address: z.object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      state: z.string(),
      zip: z.string()
    }).optional(),
    desiredDateTime: z.string().optional(),
    notes: z.string().optional()
  }),
  design: z.object({
    mode: z.string(),
    aiIncludedRuns: z.number().optional(),
    aiRunsUsed: z.number().optional(),
    prompt: z.string().optional(),
    assets: z.array(z.string()).optional()
  }),
  totals: z.object({
    subtotal: z.number(),
    shipping: z.number(),
    grandTotal: z.number()
  }),
  shipping: z.object({
    shipmentId: z.string().optional(),
    rateId: z.string().optional()
  }),
  lines: z.array(z.object({
    sheetKey: z.string(),
    layout: z.object({
      kind: z.string(),
      label: z.string(),
      sizeIn: z.number(),
      shape: z.string()
    }),
    qty: z.number(),
    rush: z.boolean().optional(),
    cutting: z.boolean().optional()
  }))
});

export const zRateRequest = z.object({
  to: z.object({
    name: z.string(),
    street1: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    email: z.string().email()
  }),
  parcel: z.object({
    length: z.number(),
    width: z.number(),
    height: z.number(),
    weight_oz: z.number()
  }),
  options: z.object({
    label_format: z.string()
  })
});