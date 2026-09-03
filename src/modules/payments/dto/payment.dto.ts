import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum PaymentGateway {
  JAZZCASH = 'jazzcash',
  EASYPAISA = 'easypaisa',
  STRIPE = 'stripe',
}

export class CheckoutDto {
  @IsUUID()
  courseId: string;

  @IsEnum(PaymentGateway)
  gateway: PaymentGateway;

  @IsOptional()
  @IsString()
  couponCode?: string;
}

// Simulates the gateway calling back — in production this shape comes
// from the actual provider's webhook payload (different per gateway).
// This normalized shape is what PaymentProviderService's real
// implementation would translate each gateway's raw payload into,
// AFTER signature verification (which happens against the raw body,
// not this parsed object — see PaymentsController).
export class PaymentWebhookDto {
  @IsEnum(PaymentGateway)
  gateway: PaymentGateway;

  @IsString()
  transactionRef: string;

  @IsEnum(['SUCCESS', 'FAILED'] as const)
  status: 'SUCCESS' | 'FAILED';
}
