export interface Customer {
  name?: string;
  email: string;
  phone?: string;
  pickup: boolean;
  pickupLocation?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
  };
  desiredDateTime?: string;
  notes?: string;
}

export interface Design {
  mode: string;
  aiIncludedRuns?: number;
  aiRunsUsed?: number;
  prompt?: string;
  assets?: string[];
}

export interface Totals {
  subtotal: number;
  shipping: number;
  grandTotal: number;
}

export interface Shipping {
  shipmentId?: string;
  rateId?: string;
}

export interface LineItem {
  sheetKey: string;
  layout: {
    kind: string;
    label: string;
    sizeIn: number;
    shape: string;
  };
  qty: number;
  rush?: boolean;
  cutting?: boolean;
}

export interface OrderPayload {
  customer: Customer;
  design: Design;
  totals: Totals;
  shipping: Shipping;
  lines: LineItem[];
}

export interface RateRequest {
  to: {
    name: string;
    street1: string;
    city: string;
    state: string;
    zip: string;
    email: string;
  };
  parcel: {
    length: number;
    width: number;
    height: number;
    weight_oz: number;
  };
  options: {
    label_format: string;
  };
}