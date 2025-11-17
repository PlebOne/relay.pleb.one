import { env } from "@/env";

export interface PaymentRequest {
  amount: number; // in sats
  description: string;
  expiry?: number; // seconds
}

export interface PaymentResponse {
  paymentHash: string;
  invoice: string;
  checkUrl: string;
}

export interface PaymentStatus {
  paid: boolean;
  preimage?: string;
  paymentTime?: number;
}

/**
 * Abstract payment provider interface
 * This modular approach allows easy integration of different Lightning providers
 */
export abstract class BasePaymentProvider {
  abstract name: string;
  
  /**
   * Create a Lightning invoice
   */
  abstract createInvoice(request: PaymentRequest): Promise<PaymentResponse>;
  
  /**
   * Check payment status
   */
  abstract checkPayment(paymentHash: string): Promise<PaymentStatus>;
  
  /**
   * Verify webhook authenticity (if supported)
   */
  verifyWebhook?(payload: unknown, signature: string): boolean;
}

/**
 * Lightning Network Daemon (LND) provider
 */
export class LNDProvider extends BasePaymentProvider {
  name = "LND";
  
  private nodeUrl: string;
  private macaroon: string;
  
  constructor() {
    super();
    this.nodeUrl = env.LIGHTNING_NODE_URL || "";
    this.macaroon = env.LIGHTNING_MACAROON || "";
  }
  
  async createInvoice(request: PaymentRequest): Promise<PaymentResponse> {
    // Implementation would make actual LND API calls
    // This is a placeholder structure
    
    const response = await fetch(`${this.nodeUrl}/v1/invoices`, {
      method: "POST",
      headers: {
        "Grpc-Metadata-macaroon": this.macaroon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        memo: request.description,
        value: request.amount,
        expiry: request.expiry || 3600,
      }),
    });
    
    const data = await response.json();
    
    return {
      paymentHash: data.r_hash,
      invoice: data.payment_request,
      checkUrl: `${this.nodeUrl}/v1/invoice/${data.r_hash}`,
    };
  }
  
  async checkPayment(paymentHash: string): Promise<PaymentStatus> {
    const response = await fetch(`${this.nodeUrl}/v1/invoice/${paymentHash}`, {
      headers: {
        "Grpc-Metadata-macaroon": this.macaroon,
      },
    });
    
    const data = await response.json();
    
    return {
      paid: data.settled,
      preimage: data.r_preimage,
      paymentTime: data.settle_date,
    };
  }
}

/**
 * LNURL-Pay provider (for services like LNbits, BTCPay, etc.)
 */
export class LNURLProvider extends BasePaymentProvider {
  name = "LNURL";
  
  private endpoint: string;
  
  constructor(endpoint: string) {
    super();
    this.endpoint = endpoint;
  }
  
  async createInvoice(request: PaymentRequest): Promise<PaymentResponse> {
    // LNURL-Pay implementation
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: request.amount * 1000, // Convert to millisats
        comment: request.description,
      }),
    });
    
    const data = await response.json();
    
    return {
      paymentHash: data.payment_hash,
      invoice: data.pr,
      checkUrl: data.verify_url,
    };
  }
  
  async checkPayment(paymentHash: string): Promise<PaymentStatus> {
    void paymentHash;
    // Implementation would check payment status via LNURL service
    // Placeholder for now
    return { paid: false };
  }
}

/**
 * Payment manager - handles different providers
 */
export class PaymentManager {
  private provider: BasePaymentProvider;
  
  constructor() {
    // Initialize based on environment configuration
    if (env.LIGHTNING_NODE_URL && env.LIGHTNING_MACAROON) {
      this.provider = new LNDProvider();
    } else {
      // Fallback to mock provider for development
      this.provider = new MockProvider();
    }
  }
  
  async createSubscriptionInvoice(
    type: "relay" | "blossom" | "combo",
    duration: "monthly" | "yearly"
  ): Promise<PaymentResponse> {
    let amount: number;
    let description: string;
    
    switch (type) {
      case "relay":
        amount = duration === "monthly" ? env.MONTHLY_PRICE_SATS : env.YEARLY_PRICE_SATS;
        description = `Relay access - ${duration}`;
        break;
      case "blossom":
        amount = duration === "monthly" ? env.BLOSSOM_MONTHLY_PRICE_SATS : env.BLOSSOM_YEARLY_PRICE_SATS;
        description = `Blossom server access - ${duration}`;
        break;
      case "combo":
        const relayPrice = duration === "monthly" ? env.MONTHLY_PRICE_SATS : env.YEARLY_PRICE_SATS;
        const blossomPrice = duration === "monthly" ? env.BLOSSOM_MONTHLY_PRICE_SATS : env.BLOSSOM_YEARLY_PRICE_SATS;
        amount = relayPrice + blossomPrice;
        description = `Relay + Blossom combo - ${duration}`;
        break;
    }
    
    return this.provider.createInvoice({
      amount,
      description,
      expiry: 3600, // 1 hour
    });
  }
  
  async checkPayment(paymentHash: string): Promise<PaymentStatus> {
    return this.provider.checkPayment(paymentHash);
  }
}

/**
 * Mock provider for development/testing
 */
class MockProvider extends BasePaymentProvider {
  name = "Mock";
  
  async createInvoice(request: PaymentRequest): Promise<PaymentResponse> {
    const mockHash = "mock_payment_hash_" + Date.now();
    return {
      paymentHash: mockHash,
      invoice: "lnbc" + request.amount + "mock_invoice",
      checkUrl: "/api/payments/check/" + mockHash,
    };
  }
  
  async checkPayment(paymentHash: string): Promise<PaymentStatus> {
    // Mock payment is always paid after 10 seconds
    const created = parseInt(paymentHash.split("_").pop() || "0");
    const isPaid = Date.now() - created > 10000;
    
    return {
      paid: isPaid,
      preimage: isPaid ? "mock_preimage" : undefined,
      paymentTime: isPaid ? Math.floor(Date.now() / 1000) : undefined,
    };
  }
}