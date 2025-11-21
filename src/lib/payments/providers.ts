/**
 * Mock payment provider (whitelist-based relay doesn't use payments)
 * This file is kept for potential future monetization features
 */

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
}

/**
 * Payment manager - currently only returns mock provider
 * This relay uses whitelist-based access, not payments
 */
export class PaymentManager {
  private provider: BasePaymentProvider;
  
  constructor() {
    // Always use mock provider for whitelist-based system
    this.provider = new MockProvider();
  }
  
  async createSubscriptionInvoice(
    type: "relay",
    duration: "monthly" | "yearly"
  ): Promise<PaymentResponse> {
    const amount = 1000; // Default mock amount
    const description = `${type} access - ${duration} (whitelist-based, no payment required)`;
    
    return this.provider.createInvoice({
      amount,
      description,
      expiry: 3600,
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