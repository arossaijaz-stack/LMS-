import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateBrandSettingsDto } from './dto/theming.dto';

const DEFAULT_TENANT_SUBDOMAIN = 'default';

const DEFAULTS = {
  academyName: 'My Academy',
  primaryColor: '#1E40AF',
  secondaryColor: '#F59E0B',
  fontFamily: 'Inter',
};

@Injectable()
export class BrandSettingsService {
  constructor(private prisma: PrismaService) {}

  // Public — the frontend calls this on every page load to know which
  // colors/logo/fonts to inject as CSS variables (Phase 0's tokens.css:
  // "overridden dynamically per academy"). Single-academy for now, so
  // this transparently works against one implicit default tenant rather
  // than requiring the frontend to know a tenant ID.
  async getCurrent() {
    const settings = await this.prisma.brandSettings.findFirst({
      where: { tenant: { subdomain: DEFAULT_TENANT_SUBDOMAIN } },
    });
    if (settings) return settings;

    // No settings saved yet — return computed defaults WITHOUT writing
    // to the database. A GET should never have a side effect; the row
    // is created lazily the first time an admin actually saves via
    // update().
    return { ...DEFAULTS, logoUrl: null, heroTitle: null, heroSubtitle: null, heroImageUrl: null };
  }

  async update(dto: UpdateBrandSettingsDto) {
    const tenant = await this.getOrCreateDefaultTenant();

    return this.prisma.brandSettings.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        academyName: dto.academyName ?? DEFAULTS.academyName,
        logoUrl: dto.logoUrl,
        primaryColor: dto.primaryColor ?? DEFAULTS.primaryColor,
        secondaryColor: dto.secondaryColor ?? DEFAULTS.secondaryColor,
        fontFamily: dto.fontFamily ?? DEFAULTS.fontFamily,
        heroTitle: dto.heroTitle,
        heroSubtitle: dto.heroSubtitle,
        heroImageUrl: dto.heroImageUrl,
      },
      update: dto,
    });
  }

  // "Preview before publish" (v1): computes what the final settings
  // WOULD look like after applying the proposed partial changes on top
  // of the current saved values, without writing anything to the
  // database. The admin UI can render this against the live component
  // library, then call update() only once satisfied. Deliberately
  // simpler than a full draft/published state machine — see the Phase 9
  // README for the tradeoff.
  async preview(dto: UpdateBrandSettingsDto) {
    const current = await this.getCurrent();
    return { ...current, ...dto };
  }

  private async getOrCreateDefaultTenant() {
    const existing = await this.prisma.tenant.findUnique({
      where: { subdomain: DEFAULT_TENANT_SUBDOMAIN },
    });
    if (existing) return existing;

    return this.prisma.tenant.create({
      data: { name: DEFAULTS.academyName, subdomain: DEFAULT_TENANT_SUBDOMAIN },
    });
  }
}
