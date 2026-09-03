import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ---------- Brand settings ----------

export class UpdateBrandSettingsDto {
  @IsOptional()
  @IsString()
  academyName?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  // @IsHexColor enforces a real #RRGGBB (or #RGB) value — a client typo
  // like "blue" or a missing "#" should fail validation loudly here
  // rather than silently breaking every page's CSS at render time.
  @IsOptional()
  @IsHexColor()
  primaryColor?: string;

  @IsOptional()
  @IsHexColor()
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  fontFamily?: string;

  @IsOptional()
  @IsString()
  heroTitle?: string;

  @IsOptional()
  @IsString()
  heroSubtitle?: string;

  @IsOptional()
  @IsString()
  heroImageUrl?: string;
}

// ---------- CMS content blocks ----------

export class CreateContentBlockDto {
  @IsString()
  @MinLength(1)
  section: string; // e.g. "features" | "testimonials" | "faq"

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateContentBlockDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class ReorderContentBlockItem {
  @IsString()
  id: string;

  @IsInt()
  order: number;
}

export class ReorderContentBlocksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderContentBlockItem)
  items: ReorderContentBlockItem[];
}
