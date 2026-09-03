import { IsString, MinLength } from 'class-validator';

// Internal use only — other services call NotificationsService.create()
// directly rather than going through an HTTP endpoint, so this DTO is
// mainly for documentation/type-safety of that internal call shape.
export class CreateNotificationDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  body: string;
}
