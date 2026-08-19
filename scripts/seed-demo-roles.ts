/**
 * Seeds one demo user per RBAC role (pm/po/developer/tester/executive) against
 * the existing tenant, so the PM → PO delegation flow is demoable end to end
 * without a UI-driven invite flow existing yet.
 * Usage: npx tsx scripts/seed-demo-roles.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'demo1234'; // Change this for production!

const DEMO_USERS = [
  { email: 'pm@demo.com', name: 'Priya PM', role: 'pm' },
  { email: 'po@demo.com', name: 'Owen Owner', role: 'po' },
  { email: 'developer@demo.com', name: 'Dana Developer', role: 'developer' },
  { email: 'tester@demo.com', name: 'Tara Tester', role: 'tester' },
  { email: 'leadership@demo.com', name: 'Lee Leadership', role: 'executive' },
] as const;

async function seedDemoRoles() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    throw new Error('No tenant exists yet — create one first (e.g. via POST /api/v1/admin/setup-organization).');
  }

  // PO/developer/tester are scoped to a single product for the demo; pm/executive are org-wide.
  const firstProduct = await prisma.product.findFirst({ where: { tenantId: tenant.id } });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  console.log(`🔧 Seeding demo users for tenant "${tenant.name}"...`);

  for (const demo of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { passwordHash, name: demo.name, role: demo.role, isActive: true, tenantId: tenant.id },
      create: { email: demo.email, passwordHash, name: demo.name, role: demo.role, isActive: true, tenantId: tenant.id },
    });

    const scopedToOneProduct = demo.role === 'po' || demo.role === 'developer' || demo.role === 'tester';
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      update: {
        role: demo.role,
        accessibleProducts: scopedToOneProduct && firstProduct ? [firstProduct.id] : [],
        defaultRole: demo.role,
        defaultProductId: scopedToOneProduct ? firstProduct?.id ?? null : null,
      },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        role: demo.role,
        accessibleProducts: scopedToOneProduct && firstProduct ? [firstProduct.id] : [],
        defaultRole: demo.role,
        defaultProductId: scopedToOneProduct ? firstProduct?.id ?? null : null,
      },
    });

    console.log(`  ✅ ${demo.role.padEnd(10)} ${demo.email}`);
  }

  // Give the seeded PO a live delegation so "PM delegates connection-setup to
  // PO for their product" is demoable immediately, not just theoretically possible.
  if (firstProduct) {
    const pm = await prisma.user.findUniqueOrThrow({ where: { email: 'pm@demo.com' } });
    const po = await prisma.user.findUniqueOrThrow({ where: { email: 'po@demo.com' } });
    const existingDelegation = await prisma.integrationDelegation.findFirst({
      where: { productId: firstProduct.id, granteeId: po.id, revokedAt: null },
    });
    if (!existingDelegation) {
      await prisma.integrationDelegation.create({
        data: { tenantId: tenant.id, productId: firstProduct.id, granteeId: po.id, grantedBy: pm.id },
      });
      console.log(`  ✅ delegation   PM granted PO mapping rights on "${firstProduct.name}"`);
    }
  }

  console.log('\n🌐 Login at: http://localhost:8086/login');
  console.log(`🔑 Password for all demo accounts: ${DEMO_PASSWORD}`);

  await prisma.$disconnect();
}

seedDemoRoles().catch(console.error);
