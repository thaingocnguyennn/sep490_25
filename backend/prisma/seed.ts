import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Seed roles
  const roles = [
    {
      name: 'ADMIN',
      description: 'System administrator with full access',
    },
    {
      name: 'USER',
      description: 'Regular user with standard access',
    },
    {
      name: 'MANAGER',
      description: 'Department manager with elevated permissions',
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
  console.log('✅ Roles seeded');

  // Seed default admin user
  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  const hashedPassword = await bcrypt.hash('Admin@123', 12);

  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@dms.local',
      password: hashedPassword,
      fullName: 'System Administrator',
      phone: '0900000001',
      status: UserStatus.ACTIVE,
      isFirstLogin: true,
      createdBy: null,
      updatedBy: null,
      userRoles: {
        create: {
          roleId: adminRole!.id,
        },
      },
    },
  });
  console.log(`✅ Admin user seeded: username=admin, password=Admin@123`);

  // Seed default regular user
  const userRole = await prisma.role.findUnique({ where: { name: 'USER' } });
  const userPassword = await bcrypt.hash('User@123', 12);

  const regularUser = await prisma.user.upsert({
    where: { username: 'user01' },
    update: {},
    create: {
      username: 'user01',
      email: 'user01@dms.local',
      password: userPassword,
      fullName: 'Nguyen Van A',
      phone: '0900000002',
      status: UserStatus.ACTIVE,
      isFirstLogin: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
      userRoles: {
        create: {
          roleId: userRole!.id,
        },
      },
    },
  });
  console.log(`✅ Regular user seeded: username=user01, password=User@123`);

  console.log('🎉 Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
