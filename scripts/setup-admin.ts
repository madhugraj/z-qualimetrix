/**
 * Quick script to create/update an admin user with a password for testing
 * Usage: npx tsx scripts/setup-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function setupAdmin() {
  const email = 'admin@demo.com';
  const password = 'admin123'; // Change this for production!
  const name = 'Admin User';
  const role = 'admin';

  console.log('🔧 Setting up admin user...');

  // Hash the password
  const passwordHash = await bcrypt.hash(password, 12);

  // Check if user exists
  const existingUser = await prisma.user.findUnique({ where: { email } });

  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    throw new Error('No tenant exists yet — create one first (e.g. via POST /api/v1/admin/setup-organization).');
  }

  if (existingUser) {
    console.log('✅ Updating existing user:', email);
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash,
        name,
        role,
        isActive: true,
        tenantId: existingUser.tenantId ?? tenant.id, // Ensure tenant is set
      },
    });
  } else {
    console.log('✅ Creating new admin user:', email);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        isActive: true,
        tenantId: tenant.id,
      },
    });
  }

  console.log('✅ Admin user ready!');
  console.log('📧 Email:', email);
  console.log('🔑 Password:', password);
  console.log('🌐 Login at: http://localhost:8086/login');

  await prisma.$disconnect();
}

setupAdmin().catch(console.error);