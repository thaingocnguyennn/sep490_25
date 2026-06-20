import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Seed roles
  const roles = [
    {
      name: 'ADMIN',
      description: 'System administrator with full access',
    },
    {
      name: 'DEPARTMENT_HEAD',
      description: 'Department head with management permissions',
    },
    {
      name: 'SPECIALIST',
      description: 'Specialist with document processing permissions',
    },
    {
      name: 'DOCUMENT_CLERK',
      description: 'Document clerk with basic document access',
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
  console.log('Roles seeded');

  // Seed confidentiality classifications (lookup table replacing the previous enum)
  const confidentialityLevels = [
    { code: 'A',     name: 'TUYET_MAT', description: 'Tuyệt mật — mức độ mật cao nhất' },
    { code: 'B',     name: 'TOI_MAT',   description: 'Tối mật — mức độ mật cao' },
    { code: 'C',     name: 'MAT',       description: 'Mật — mức độ mật' },
    { code: null,    name: 'THUONG',    description: 'Thường — không có mã mức độ mật trên văn bản' },
  ];

  for (const level of confidentialityLevels) {
    await prisma.confidentiality.upsert({
      where: { name: level.name },
      update: {
        code: level.code,
        description: level.description,
      },
      create: level,
    });
  }
  console.log('Confidentiality levels seeded');

  // Seed urgency levels (lookup table replacing the previous Urgency enum)
  const urgencyLevels = [
    { name: 'THUONG',      description: 'Thường — độ khẩn bình thường' },
    { name: 'KHAN',        description: 'Khẩn' },
    { name: 'THUONG_KHAN', description: 'Thượng khẩn' },
    { name: 'HOA_TOC',     description: 'Hỏa tốc — mức khẩn cao nhất' },
  ];

  for (const level of urgencyLevels) {
    await prisma.urgency.upsert({
      where: { name: level.name },
      update: { description: level.description },
      create: level,
    });
  }
  console.log('Urgency levels seeded');

  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  const deptHeadRole = await prisma.role.findUnique({ where: { name: 'DEPARTMENT_HEAD' } });
  const specialistRole = await prisma.role.findUnique({ where: { name: 'SPECIALIST' } });
  const docClerkRole = await prisma.role.findUnique({ where: { name: 'DOCUMENT_CLERK' } });

  const hashedPassword = await bcrypt.hash('Password@123', 12);

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
        create: { roleId: adminRole!.id },
      },
    },
  });
  console.log('Admin user seeded: admin / Password@123');

  await prisma.user.upsert({
    where: { username: 'depthead01' },
    update: {},
    create: {
      username: 'depthead01',
      email: 'depthead01@dms.local',
      password: hashedPassword,
      fullName: 'Tran Thi B',
      phone: '0900000002',
      status: UserStatus.ACTIVE,
      isFirstLogin: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
      userRoles: {
        create: { roleId: deptHeadRole!.id },
      },
    },
  });
  console.log('Department Head seeded: depthead01 / Password@123');

  await prisma.user.upsert({
    where: { username: 'specialist01' },
    update: {},
    create: {
      username: 'specialist01',
      email: 'specialist01@dms.local',
      password: hashedPassword,
      fullName: 'Le Van C',
      phone: '0900000003',
      status: UserStatus.ACTIVE,
      isFirstLogin: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
      userRoles: {
        create: { roleId: specialistRole!.id },
      },
    },
  });
  console.log('Specialist seeded: specialist01 / Password@123');

  await prisma.user.upsert({
    where: { username: 'clerk01' },
    update: {},
    create: {
      username: 'clerk01',
      email: 'clerk01@dms.local',
      password: hashedPassword,
      fullName: 'Pham Thi D',
      phone: '0900000004',
      status: UserStatus.ACTIVE,
      isFirstLogin: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
      userRoles: {
        create: { roleId: docClerkRole!.id },
      },
    },
  });
  console.log('Document Clerk seeded: clerk01 / Password@123');

  // Seed default workflow steps for incoming documents
  const defaultSteps = [
    { name: 'Tiếp nhận văn bản', description: 'Nhân viên tiếp nhận và phân loại văn bản đến', stepOrder: 1, roleName: 'DOCUMENT_CLERK' },
    { name: 'Trưởng phòng xử lý', description: 'Trưởng phòng xem xét và phân công xử lý', stepOrder: 2, roleName: 'DEPARTMENT_HEAD' },
    { name: 'Chuyên viên xử lý', description: 'Chuyên viên thực hiện xử lý văn bản', stepOrder: 3, roleName: 'SPECIALIST' },
    { name: 'Lưu trữ', description: 'Lưu trữ văn bản sau khi xử lý hoàn tất', stepOrder: 4, roleName: null },
  ];

  const existingSteps = await prisma.workflowStep.count();
  if (existingSteps === 0) {
    await prisma.workflowStep.createMany({
      data: defaultSteps,
    });
  }
  console.log('Workflow steps seeded');

  console.log('Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
