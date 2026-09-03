import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  subject: string;

  @IsString()
  @MinLength(1)
  message: string;
}

export class ReplyToTicketDto {
  @IsString()
  @MinLength(1)
  body: string;
}

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;
}

export class AssignTicketDto {
  @IsUUID()
  assignedToId: string;
}
