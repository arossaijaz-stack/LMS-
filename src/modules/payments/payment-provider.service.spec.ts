import * as crypto from 'crypto';
import { PaymentProviderService } from './payment-provider.service';

function buildService(envOverrides: Record<string, string> = {}) {
  const config = { get: jest.fn((key: string) => envOverrides[key]) };
  const service = new PaymentProviderService(config as any);
  return { service, config };
}

describe('PaymentProviderService — real signature verification', () => {
  describe('verifyHmacSignature', () => {
    it('accepts a correctly-computed HMAC signature', () => {
      const { service } = buildService();
      const secret = 'webhook-secret-123';
      const payload = '{"transactionRef":"ref-1","status":"SUCCESS"}';
      const validSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      expect(service.verifyHmacSignature(payload, validSignature, secret)).toBe(true);
    });

    it('rejects a signature computed with the WRONG secret', () => {
      const { service } = buildService();
      const payload = '{"transactionRef":"ref-1","status":"SUCCESS"}';
      const wrongSignature = crypto.createHmac('sha256', 'wrong-secret').update(payload).digest('hex');

      expect(service.verifyHmacSignature(payload, wrongSignature, 'real-secret')).toBe(false);
    });

    it('rejects a signature for a payload that was tampered with after signing', () => {
      const { service } = buildService();
      const secret = 'webhook-secret-123';
      const originalPayload = '{"transactionRef":"ref-1","status":"FAILED"}';
      const signature = crypto.createHmac('sha256', secret).update(originalPayload).digest('hex');

      // Attacker changes FAILED to SUCCESS after the signature was computed —
      // this is exactly the attack the old "always return true" stub allowed.
      const tamperedPayload = '{"transactionRef":"ref-1","status":"SUCCESS"}';

      expect(service.verifyHmacSignature(tamperedPayload, signature, secret)).toBe(false);
    });

    it('rejects when the signature is missing entirely', () => {
      const { service } = buildService();
      expect(service.verifyHmacSignature('payload', '', 'secret')).toBe(false);
      expect(service.verifyHmacSignature('payload', undefined as any, 'secret')).toBe(false);
    });

    it('rejects when no secret is configured', () => {
      const { service } = buildService();
      expect(service.verifyHmacSignature('payload', 'some-sig-hex', '')).toBe(false);
    });

    it('does not throw on a malformed (non-hex, wrong-length) signature — fails safely instead', () => {
      const { service } = buildService();
      expect(() => service.verifyHmacSignature('payload', 'not-valid-hex!!', 'secret')).not.toThrow();
      expect(service.verifyHmacSignature('payload', 'not-valid-hex!!', 'secret')).toBe(false);
    });
  });

  describe('verifyStripeSignatureHeader', () => {
    const secret = 'whsec_test123';

    function makeStripeHeader(payload: string, timestamp: number, useSecret = secret) {
      const signedPayload = `${timestamp}.${payload}`;
      const v1 = crypto.createHmac('sha256', useSecret).update(signedPayload).digest('hex');
      return `t=${timestamp},v1=${v1}`;
    }

    it('accepts a validly-signed, fresh Stripe webhook', () => {
      const { service } = buildService();
      const payload = '{"type":"checkout.session.completed"}';
      const header = makeStripeHeader(payload, Math.floor(Date.now() / 1000));

      expect(service.verifyStripeSignatureHeader(payload, header, secret)).toBe(true);
    });

    it('rejects a Stripe webhook signed with the wrong secret', () => {
      const { service } = buildService();
      const payload = '{"type":"checkout.session.completed"}';
      const header = makeStripeHeader(payload, Math.floor(Date.now() / 1000), 'wrong-secret');

      expect(service.verifyStripeSignatureHeader(payload, header, secret)).toBe(false);
    });

    it('rejects a REPLAYED webhook whose timestamp is outside the tolerance window', () => {
      const { service } = buildService();
      const payload = '{"type":"checkout.session.completed"}';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour old
      const header = makeStripeHeader(payload, oldTimestamp);

      expect(service.verifyStripeSignatureHeader(payload, header, secret, 300)).toBe(false);
    });

    it('accepts a timestamp just inside the tolerance window', () => {
      const { service } = buildService();
      const payload = '{"type":"checkout.session.completed"}';
      const recentTimestamp = Math.floor(Date.now() / 1000) - 100; // 100s old, under 300s tolerance
      const header = makeStripeHeader(payload, recentTimestamp);

      expect(service.verifyStripeSignatureHeader(payload, header, secret, 300)).toBe(true);
    });

    it('rejects a malformed header missing the v1 or t component', () => {
      const { service } = buildService();
      expect(service.verifyStripeSignatureHeader('payload', 't=12345', secret)).toBe(false);
      expect(service.verifyStripeSignatureHeader('payload', 'v1=abc123', secret)).toBe(false);
      expect(service.verifyStripeSignatureHeader('payload', '', secret)).toBe(false);
      expect(service.verifyStripeSignatureHeader('payload', undefined, secret)).toBe(false);
    });

    it('rejects tampered payload even with a structurally valid header', () => {
      const { service } = buildService();
      const originalPayload = '{"amount":100}';
      const timestamp = Math.floor(Date.now() / 1000);
      const header = makeStripeHeader(originalPayload, timestamp);

      const tamperedPayload = '{"amount":100000}'; // attacker inflates the amount
      expect(service.verifyStripeSignatureHeader(tamperedPayload, header, secret)).toBe(false);
    });
  });

  describe('verifyGenericWebhookSignature (JazzCash/Easypaisa)', () => {
    it('verifies correctly when a real secret is configured', () => {
      const secret = 'jazzcash-salt-abc';
      const { service } = buildService({ JAZZCASH_INTEGRITY_SALT: secret });
      const payload = 'raw-jazzcash-payload';
      const validSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      expect(service.verifyGenericWebhookSignature('jazzcash', payload, validSignature)).toBe(true);
    });

    it('rejects an incorrect signature when a real secret is configured', () => {
      const { service } = buildService({ JAZZCASH_INTEGRITY_SALT: 'real-salt' });
      expect(
        service.verifyGenericWebhookSignature('jazzcash', 'payload', 'totally-wrong-signature'),
      ).toBe(false);
    });

    it('fails CLOSED in production when no secret is configured — the key regression test for the old stub', () => {
      const { service } = buildService({ NODE_ENV: 'production' }); // no JAZZCASH_INTEGRITY_SALT set
      expect(service.verifyGenericWebhookSignature('jazzcash', 'payload', 'any-signature')).toBe(false);
    });

    it('allows requests through in development when no secret is configured, for local testing convenience', () => {
      const { service } = buildService({ NODE_ENV: 'development' });
      expect(service.verifyGenericWebhookSignature('jazzcash', 'payload', 'any-signature')).toBe(true);
    });

    it('uses the correct secret key per gateway (jazzcash vs easypaisa are independent)', () => {
      const { service, config } = buildService({
        JAZZCASH_INTEGRITY_SALT: 'jazzcash-secret',
        EASYPAISA_HASH_KEY: 'easypaisa-secret',
      });

      service.verifyGenericWebhookSignature('easypaisa', 'payload', 'sig');
      expect(config.get).toHaveBeenCalledWith('EASYPAISA_HASH_KEY');
    });
  });
});
