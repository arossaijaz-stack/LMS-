import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// Same honest pattern as MediaService (Bunny/S3) and LiveClassProviderService
// (Zoom) for createCheckoutSession — this shows the shape of the real
// integration without a live credential to actually call out to.
//
// verifyWebhookSignature, however, is NO LONGER a stub as of Phase 10.
// This was flagged as THE critical security gap since Phase 7 — a stub
// that always returned true would let anyone POST a fake "payment
// succeeded" webhook and get free course access. It now does real
// HMAC-SHA256 signature verification.
@Injectable()
export class PaymentProviderService {
  private readonly logger = new Logger(PaymentProviderService.name);

  constructor(private config: ConfigService) {}

  async createCheckoutSession(params: {
    gateway: 'jazzcash' | 'easypaisa' | 'stripe';
    amount: number;
    currency: string;
    description: string;
  }) {
    const providerRef = crypto.randomUUID();

    const checkoutUrlByGateway: Record<string, string> = {
      jazzcash: `https://sandbox.jazzcash.com.pk/checkout/${providerRef}`,
      easypaisa: `https://easypay.easypaisa.com.pk/checkout/${providerRef}`,
      stripe: `https://checkout.stripe.com/pay/${providerRef}`,
    };

    return {
      providerRef,
      checkoutUrl: checkoutUrlByGateway[params.gateway],
      note: 'Placeholder response — wire the real gateway API call before use.',
    };
  }

  // ---------- Signature verification (REAL as of Phase 10) ----------

  // Generic constant-time HMAC-SHA256 verification — the correct
  // primitive underlying every major gateway's webhook signing scheme
  // (Stripe, JazzCash, Easypaisa all use HMAC variants). Using
  // crypto.timingSafeEqual instead of `===` matters: a naive string
  // comparison leaks timing information an attacker can use to guess
  // the correct signature byte-by-byte.
  verifyHmacSignature(payload: string, providedSignatureHex: string, secret: string): boolean {
    if (!providedSignatureHex || !secret) return false;

    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(providedSignatureHex, 'hex');

    // Buffers of different length would make timingSafeEqual throw
    // rather than return false — guard explicitly.
    if (expectedBuf.length !== providedBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  // Real implementation of Stripe's actual webhook verification
  // algorithm (the same one their official SDK's
  // `stripe.webhooks.constructEvent` performs internally) — no `stripe`
  // package dependency needed, since it's just documented HMAC + a
  // timestamp tolerance check:
  //   1. Header looks like: "t=1614556800,v1=5257a869e7ece..."
  //   2. signed_payload = `${timestamp}.${rawBody}`
  //   3. expected = HMAC-SHA256(webhookSecret, signed_payload)
  //   4. Reject if the timestamp is outside the tolerance window
  //      (replay-attack protection — an old, previously-valid signature
  //      should not be replayable indefinitely)
  verifyStripeSignatureHeader(
    rawBody: string,
    stripeSignatureHeader: string | undefined,
    secret: string,
    toleranceSeconds = 300,
  ): boolean {
    if (!stripeSignatureHeader || !secret) return false;

    const parts = Object.fromEntries(
      stripeSignatureHeader.split(',').map((part) => {
        const [key, value] = part.split('=');
        return [key, value];
      }),
    );
    const timestamp = parts['t'];
    const v1Signature = parts['v1'];
    if (!timestamp || !v1Signature) return false;

    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (Number.isNaN(ageSeconds) || ageSeconds > toleranceSeconds) {
      this.logger.warn('Rejected Stripe webhook: timestamp outside tolerance window');
      return false;
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    return this.verifyHmacSignature(signedPayload, v1Signature, secret);
  }

  // Dispatches to the right verification strategy per gateway. JazzCash
  // and Easypaisa's exact signed-field ordering varies by their specific
  // API docs (which you'll need once real merchant credentials exist —
  // this generic HMAC-over-the-whole-payload check is a reasonable
  // starting shape, not a guaranteed byte-exact match to their spec).
  // Stripe's path above IS the exact real algorithm and is
  // production-correct as-is.
  //
  // Safety net: if no secret is configured at all, this REFUSES the
  // webhook in production but allows it through (with a loud warning)
  // in development — so local testing without real gateway credentials
  // still works, while a misconfigured production deploy fails closed
  // instead of silently trusting everything like the old stub did.
  verifyGenericWebhookSignature(
    gateway: 'jazzcash' | 'easypaisa',
    rawBody: string,
    signature: string | undefined,
  ): boolean {
    const secretKey = gateway === 'jazzcash' ? 'JAZZCASH_INTEGRITY_SALT' : 'EASYPAISA_HASH_KEY';
    const secret = this.config.get<string>(secretKey);

    if (!secret) {
      const isProd = this.config.get<string>('NODE_ENV') === 'production';
      if (isProd) {
        this.logger.error(`Refusing webhook: ${secretKey} is not configured in production`);
        return false;
      }
      this.logger.warn(`${secretKey} not set — allowing webhook through (development only)`);
      return true;
    }

    return this.verifyHmacSignature(rawBody, signature ?? '', secret);
  }
}
