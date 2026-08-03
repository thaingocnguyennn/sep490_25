import { PrismaClient, UserStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { config } from '../src/config';

const prisma = new PrismaClient();

function resolveSeedPassword(overridden: string, label: string): string {
  if (overridden && overridden.trim() !== '') {
    if (overridden.length < 8) {
      throw new Error(
        `${label} must be at least 8 characters long. Refusing to seed.`,
      );
    }
    return overridden;
  }

  if (config.nodeEnv === 'production') {
    throw new Error(
      `${label} is not set and NODE_ENV=production. ` +
        'Refusing to seed users with default credentials in production.',
    );
  }

  // Dev fallback — still warn loudly so it doesn't slip into production.
  console.warn(
    `[seed] WARNING: ${label} is not set; falling back to a development-only ` +
      'default password. Set SEED_ADMIN_PASSWORD / SEED_DEFAULT_USER_PASSWORD ' +
      'in backend/.env to override.',
  );
  return 'Password@123';
}

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

  const adminPassword = resolveSeedPassword(
    config.seed.adminPassword,
    'SEED_ADMIN_PASSWORD',
  );
  const defaultPassword = resolveSeedPassword(
    config.seed.defaultUserPassword || config.seed.adminPassword,
    'SEED_DEFAULT_USER_PASSWORD',
  );

  const adminHashedPassword = await bcrypt.hash(adminPassword, config.bcrypt.saltRounds);
  const defaultHashedPassword = await bcrypt.hash(defaultPassword, config.bcrypt.saltRounds);

  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@dms.local',
      password: adminHashedPassword,
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
  console.log('Admin user seeded');

  await prisma.user.upsert({
    where: { username: 'depthead01' },
    update: {},
    create: {
      username: 'depthead01',
      email: 'depthead01@dms.local',
      password: defaultHashedPassword,
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
  console.log('Department Head seeded');

  await prisma.user.upsert({
    where: { username: 'specialist01' },
    update: {},
    create: {
      username: 'specialist01',
      email: 'specialist01@dms.local',
      password: defaultHashedPassword,
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
  console.log('Specialist seeded');

  await prisma.user.upsert({
    where: { username: 'clerk01' },
    update: {},
    create: {
      username: 'clerk01',
      email: 'clerk01@dms.local',
      password: defaultHashedPassword,
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
  console.log('Document Clerk seeded');

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

  // Seed default DocumentBooks for each department
  // Creates one INCOMING and one OUTGOING book per department for the current year
  const currentYear = new Date().getFullYear();
  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const clerkUser = await prisma.user.findUnique({ where: { username: 'clerk01' } });

  if (clerkUser && departments.length > 0) {
    for (const dept of departments) {
      // Incoming book
      await prisma.documentBook.upsert({
        where: {
          departmentId_bookType_year_name: {
            departmentId: dept.id,
            bookType: 'INCOMING',
            year: currentYear,
            name: `Sổ văn bản đến ${currentYear} - ${dept.name}`,
          },
        },
        update: {},
        create: {
          name: `Sổ văn bản đến ${currentYear} - ${dept.name}`,
          bookType: 'INCOMING',
          year: currentYear,
          isDefault: true,
          status: 'ACTIVE',
          departmentId: dept.id,
          createdById: clerkUser.id,
        },
      });

      // Outgoing book
      await prisma.documentBook.upsert({
        where: {
          departmentId_bookType_year_name: {
            departmentId: dept.id,
            bookType: 'OUTGOING',
            year: currentYear,
            name: `Sổ văn bản đi ${currentYear} - ${dept.name}`,
          },
        },
        update: {},
        create: {
          name: `Sổ văn bản đi ${currentYear} - ${dept.name}`,
          bookType: 'OUTGOING',
          year: currentYear,
          isDefault: true,
          status: 'ACTIVE',
          departmentId: dept.id,
          createdById: clerkUser.id,
        },
      });
    }
    console.log(`Default document books seeded for ${departments.length} departments (year ${currentYear})`);
  } else {
    console.log('Skipping document book seed: no departments or clerk user found');
  }

  // Seed Document Categories (tên tiếng Việt)
  const categories = [
    { name: 'Hành chính',          normalizedName: 'hanh chinh',          code: 'ADMINISTRATION',       isSystem: true },
    { name: 'Nhân sự',             normalizedName: 'nhan su',             code: 'PERSONNEL',            isSystem: true },
    { name: 'Tài chính',           normalizedName: 'tai chinh',           code: 'FINANCE',              isSystem: true },
    { name: 'Đào tạo',             normalizedName: 'dao tao',             code: 'TRAINING',             isSystem: true },
    { name: 'Pháp chế',            normalizedName: 'phap che',            code: 'LEGAL',                isSystem: true },
    { name: 'Công nghệ thông tin', normalizedName: 'cong nghe thong tin', code: 'INFORMATION_TECHNOLOGY', isSystem: true },
    { name: 'Khác',                normalizedName: 'khac',                code: 'OTHER',                isSystem: true },
  ];

  for (const category of categories) {
    await prisma.documentCategory.upsert({
      where: { code: category.code },
      // Cập nhật tên tiếng Việt nếu record đã tồn tại với tên cũ tiếng Anh
      update: { name: category.name, normalizedName: category.normalizedName },
      create: {
        ...category,
        createdById: adminUser.id,
      },
    });
  }
  console.log('Document Categories seeded (tên tiếng Việt)');

  // Backfill existing documents
  const otherCategory = await prisma.documentCategory.findUnique({
    where: { code: 'OTHER' }
  });

  if (otherCategory) {
    const incomingBackfill = await prisma.incomingDocument.updateMany({
      where: { categoryId: null },
      data: { categoryId: otherCategory.id }
    });
    const outgoingBackfill = await prisma.outgoingDocument.updateMany({
      where: { categoryId: null },
      data: { categoryId: otherCategory.id }
    });
    console.log(`Backfilled category for ${incomingBackfill.count} incoming and ${outgoingBackfill.count} outgoing documents`);
  }

  // Seed Document Kinds (Thể loại văn bản – UC-71 to UC-74)
  // isSystem = false so Document Clerk can manage these entries
  const documentKinds = [
    { code: 'CV',    name: 'Công văn',    normalizedName: 'cong van',    description: 'Công văn hành chính' },
    { code: 'QD',    name: 'Quyết định', normalizedName: 'quyet dinh',  description: 'Văn bản quyết định của cơ quan' },
    { code: 'TB',    name: 'Thông báo',  normalizedName: 'thong bao',   description: 'Thông báo nội bộ và đối ngoại' },
    { code: 'BC',    name: 'Báo cáo',   normalizedName: 'bao cao',     description: 'Báo cáo định kỳ và đột xuất' },
    { code: 'KH',    name: 'Kế hoạch', normalizedName: 'ke hoach',    description: 'Kế hoạch công tác' },
    { code: 'TTR',   name: 'Tờ trình',  normalizedName: 'to trinh',    description: 'Tờ trình lên cấp trên' },
    { code: 'BB',    name: 'Biên bản',  normalizedName: 'bien ban',    description: 'Biên bản họp, kiểm tra' },
    { code: 'HD',    name: 'Hướng dẫn', normalizedName: 'huong dan',   description: 'Văn bản hướng dẫn nghiệp vụ' },
    { code: 'OTHER', name: 'Khác',      normalizedName: 'khac',        description: 'Các loại văn bản khác', isSystem: true },
  ];

  for (const kind of documentKinds) {
    await prisma.documentKind.upsert({
      where: { code: kind.code },
      update: {},
      create: {
        ...kind,
        isSystem: kind.isSystem ?? false,
        createdById: adminUser.id,
      },
    });
  }
  console.log('Document Kinds seeded');

  // Backfill: map legacy documentType String → documentTypeId
  const legacyTypeMapping: Record<string, string> = {
    'cong van': 'CV',
    'quyet dinh': 'QD',
    'thong bao': 'TB',
    'bao cao': 'BC',
    'ke hoach': 'KH',
    'to trinh': 'TTR',
    'bien ban': 'BB',
    'huong dan': 'HD',
  };

  function normalizeLegacy(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  const otherKind = await prisma.documentKind.findUnique({ where: { code: 'OTHER' } });

  if (otherKind) {
    // Backfill IncomingDocument
    const incomingDocs = await prisma.incomingDocument.findMany({
      where: { documentTypeId: null },
      select: { id: true, documentType: true },
    });

    for (const doc of incomingDocs) {
      const normalized = normalizeLegacy(doc.documentType ?? '');
      const code = legacyTypeMapping[normalized] ?? 'OTHER';
      const kind = await prisma.documentKind.findUnique({ where: { code } });
      if (kind) {
        await prisma.incomingDocument.update({
          where: { id: doc.id },
          data: { documentTypeId: kind.id },
        });
      }
    }
    console.log(`Backfilled documentTypeId for ${incomingDocs.length} incoming documents`);

    // Backfill OutgoingDocument
    const outgoingDocs = await prisma.outgoingDocument.findMany({
      where: { documentTypeId: null },
      select: { id: true, documentType: true },
    });

    for (const doc of outgoingDocs) {
      const normalized = normalizeLegacy(doc.documentType ?? '');
      const code = legacyTypeMapping[normalized] ?? 'OTHER';
      const kind = await prisma.documentKind.findUnique({ where: { code } });
      if (kind) {
        await prisma.outgoingDocument.update({
          where: { id: doc.id },
          data: { documentTypeId: kind.id },
        });
      }
    }
    console.log(`Backfilled documentTypeId for ${outgoingDocs.length} outgoing documents`);
  }

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
