import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs'; // pure JS, no native binary — see auth.service.ts comment

const prisma = new PrismaClient();

// Run with: pnpm prisma:seed
// Creates the very first Admin account so you have a way to log into
// the (future Phase 8) admin panel. Change the email/password below,
// or better, override via env vars before running in a shared environment.
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@youracademy.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      fullName: 'Super Admin',
      email,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  console.log(`Created admin user: ${admin.email}`);
  console.log(`Login with password: ${password} (change this immediately after first login)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
