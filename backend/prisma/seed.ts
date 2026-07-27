import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_TENANT_NAME = 'Acme Inc';
const SEED_TENANT_SLUG = 'acme';
const SEED_USER_EMAIL = 'dev@example.com';
const SEED_USER_PASSWORD = 'devpassword123';
const SALT_ROUNDS = 12;

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: SEED_TENANT_SLUG },
    update: {},
    create: {
      name: SEED_TENANT_NAME,
      slug: SEED_TENANT_SLUG,
    },
  });

  const passwordHash = await bcrypt.hash(SEED_USER_PASSWORD, SALT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: {
      role: Role.TENANT_ADMIN,
    },
    create: {
      email: SEED_USER_EMAIL,
      passwordHash,
      tenantId: tenant.id,
      role: Role.TENANT_ADMIN,
    },
  });

  console.log(`Seeded tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`Seeded user: ${user.email} (password: ${SEED_USER_PASSWORD}, role: ${user.role})`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
