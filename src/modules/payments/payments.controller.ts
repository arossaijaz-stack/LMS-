import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PaymentStatus, UserRole } from '@prisma/client';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CheckoutDto, PaymentWebhookDto } from './dto/payment.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type ReqUser = { id: string; role: UserRole };

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  // ---------- Student ----------

  @Post('checkout')
  checkout(@Body() dto: CheckoutDto, @CurrentUser() user: ReqUser) {
    return this.paymentsService.checkout(user, dto);
  }

  @Get('mine')
  findMine(@CurrentUser() user: ReqUser) {
    return this.paymentsService.findMine(user.id);
  }

  @Get(':id/invoice')
  getInvoice(@Param('id') id: string, @CurrentUser() user: ReqUser) {
    return this.paymentsService.getInvoice(id, user);
  }

  // ---------- Gateway webhook (public — the gateway calls this, not a logged-in user) ----------
  //
  // Uses the RAW request body (not the parsed `dto`) for signature
  // verification — see main.ts's `rawBody: true` for how Nest captures
  // this alongside its normal JSON parsing. Verifying a re-serialized
  // object instead of the exact bytes the gateway signed is a common
  // real-world bug that silently breaks webhook verification even for
  // genuine, correctly-signed requests.
  @Public()
  @Post('webhook')
  handleWebhook(
    @Body() dto: PaymentWebhookDto,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') genericSignature?: string,
    @Headers('stripe-signature') stripeSignature?: string,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(dto);
    const signature = dto.gateway === 'stripe' ? stripeSignature : genericSignature;
    return this.paymentsService.handleWebhook(dto, rawBody, signature, dto.gateway);
  }

  // ---------- Admin ----------

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll(@Query('status') status?: PaymentStatus, @Query('courseId') courseId?: string) {
    return this.paymentsService.findAll({ status, courseId });
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/confirm')
  manualConfirm(@Param('id') id: string) {
    return this.paymentsService.manualConfirm(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/refund')
  refund(@Param('id') id: string) {
    return this.paymentsService.refund(id);
  }
}
