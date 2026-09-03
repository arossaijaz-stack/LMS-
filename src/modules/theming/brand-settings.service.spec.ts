import { BrandSettingsService } from './brand-settings.service';

function buildService() {
  const prisma = {
    brandSettings: { findFirst: jest.fn(), upsert: jest.fn() },
    tenant: { findUnique: jest.fn(), create: jest.fn() },
  };
  const service = new BrandSettingsService(prisma as any);
  return { service, prisma };
}

describe('BrandSettingsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getCurrent', () => {
    it('returns sensible defaults for a fresh install with no saved settings, without writing anything', async () => {
      const { service, prisma } = buildService();
      prisma.brandSettings.findFirst.mockResolvedValue(null);

      const result = await service.getCurrent();

      expect(result.primaryColor).toBe('#1E40AF');
      expect(prisma.tenant.create).not.toHaveBeenCalled();
      expect(prisma.brandSettings.upsert).not.toHaveBeenCalled();
    });

    it('returns the saved settings when they exist', async () => {
      const { service, prisma } = buildService();
      prisma.brandSettings.findFirst.mockResolvedValue({
        academyName: 'KIPS Test Academy',
        primaryColor: '#FF0000',
      });

      const result = await service.getCurrent();
      expect(result.academyName).toBe('KIPS Test Academy');
      expect(result.primaryColor).toBe('#FF0000');
    });
  });

  describe('update', () => {
    it('creates the default tenant the first time settings are saved', async () => {
      const { service, prisma } = buildService();
      prisma.tenant.findUnique.mockResolvedValue(null);
      prisma.tenant.create.mockResolvedValue({ id: 'tenant-1', subdomain: 'default' });
      prisma.brandSettings.upsert.mockResolvedValue({ id: 'settings-1', academyName: 'KIPS' });

      await service.update({ academyName: 'KIPS' });

      expect(prisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ subdomain: 'default' }) }),
      );
    });

    it('reuses the existing default tenant on subsequent updates, never creating a second one', async () => {
      const { service, prisma } = buildService();
      prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', subdomain: 'default' });
      prisma.brandSettings.upsert.mockResolvedValue({ id: 'settings-1' });

      await service.update({ academyName: 'Updated Name' });

      expect(prisma.tenant.create).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('merges proposed changes onto current settings WITHOUT persisting anything', async () => {
      const { service, prisma } = buildService();
      prisma.brandSettings.findFirst.mockResolvedValue({
        academyName: 'Original Academy',
        primaryColor: '#1E40AF',
        secondaryColor: '#F59E0B',
      });

      const result = await service.preview({ primaryColor: '#FF00FF' });

      expect(result.primaryColor).toBe('#FF00FF'); // proposed change applied
      expect(result.academyName).toBe('Original Academy'); // untouched field preserved
      expect(prisma.brandSettings.upsert).not.toHaveBeenCalled();
      expect(prisma.tenant.create).not.toHaveBeenCalled();
    });
  });
});
