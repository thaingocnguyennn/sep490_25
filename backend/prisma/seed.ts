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
      description: 'Quản trị viên hệ thống với toàn quyền truy cập.',
    },
    {
      name: 'DEPARTMENT_HEAD',
      description: 'Trưởng phòng có quyền quản lý và phê duyệt tài liệu.',
    },
    {
      name: 'SPECIALIST',
      description: 'Chuyên viên có quyền xử lý và quản lý tài liệu được phân công.',
    },
    {
      name: 'DOCUMENT_CLERK',
      description: 'Văn thư có quyền tiếp nhận, đăng ký và quản lý tài liệu.',
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

  // Seed departments (hierarchy)
  // Root department - create only if not exists (no upsert due to parentId: null type constraint)
  let rootDept = await prisma.department.findFirst({
    where: { name: 'Đại Học FPT Cần Thơ', parentId: null },
  });
  if (!rootDept) {
    rootDept = await prisma.department.create({
      data: {
        name: 'Đại Học FPT Cần Thơ',
        description: 'Trường Đại học FPT Cần Thơ - Cơ sở gốc',
        parentId: null,
      },
    });
  }

  const cnitDept = await prisma.department.upsert({
    where: { name_parentId: { name: 'Phòng Công Nghệ Thông Tin', parentId: rootDept.id } },
    update: { description: 'Phòng Công Nghệ Thông Tin - Quản lý hệ thống CNTT' },
    create: {
      name: 'Phòng Công Nghệ Thông Tin',
      description: 'Phòng Công Nghệ Thông Tin - Quản lý hệ thống CNTT',
      parentId: rootDept.id,
    },
  });

  const daoTaoDept = await prisma.department.upsert({
    where: { name_parentId: { name: 'Phòng Đào Tạo', parentId: rootDept.id } },
    update: { description: 'Phòng Đào Tạo - Quản lý công tác đào tạo' },
    create: {
      name: 'Phòng Đào Tạo',
      description: 'Phòng Đào Tạo - Quản lý công tác đào tạo',
      parentId: rootDept.id,
    },
  });

  const ctsvDept = await prisma.department.upsert({
    where: { name_parentId: { name: 'Phòng Công Tác Sinh Viên', parentId: rootDept.id } },
    update: { description: 'Phòng Công Tác Sinh Viên - Quản lý CTSV' },
    create: {
      name: 'Phòng Công Tác Sinh Viên',
      description: 'Phòng Công Tác Sinh Viên - Quản lý CTSV',
      parentId: rootDept.id,
    },
  });

  const dvsvDept = await prisma.department.upsert({
    where: { name_parentId: { name: 'Phòng Dịch Vụ Sinh Viên', parentId: rootDept.id } },
    update: { description: 'Phòng Dịch Vụ Sinh Viên - Cung cấp dịch vụ cho sinh viên' },
    create: {
      name: 'Phòng Dịch Vụ Sinh Viên',
      description: 'Phòng Dịch Vụ Sinh Viên - Cung cấp dịch vụ cho sinh viên',
      parentId: rootDept.id,
    },
  });

  const lanhDaoDept = await prisma.department.upsert({
    where: { name_parentId: { name: 'Phòng Lãnh Đạo', parentId: rootDept.id } },
    update: { description: 'Phòng Lãnh Đạo - Ban giám hiệu và lãnh đạo trường' },
    create: {
      name: 'Phòng Lãnh Đạo',
      description: 'Phòng Lãnh Đạo - Ban giám hiệu và lãnh đạo trường',
      parentId: rootDept.id,
    },
  });

  console.log('Departments seeded (hierarchy: Đại Học FPT Cần Thơ → 5 child departments)');

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
      fullName: 'Trần Thị B',
      phone: '0900000002',
      status: UserStatus.ACTIVE,
      isFirstLogin: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
      departmentId: rootDept.id,
      userRoles: {
        create: { roleId: deptHeadRole!.id },
      },
    },
  });
  console.log('Department Head (root) seeded');

  await prisma.user.upsert({
    where: { username: 'specialist01' },
    update: {},
    create: {
      username: 'specialist01',
      email: 'specialist01@dms.local',
      password: defaultHashedPassword,
      fullName: 'Lê Văn C',
      phone: '0900000003',
      status: UserStatus.ACTIVE,
      isFirstLogin: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
      departmentId: rootDept.id,
      userRoles: {
        create: { roleId: specialistRole!.id },
      },
    },
  });
  console.log('Specialist (root) seeded');

  await prisma.user.upsert({
    where: { username: 'clerk01' },
    update: {},
    create: {
      username: 'clerk01',
      email: 'clerk01@dms.local',
      password: defaultHashedPassword,
      fullName: 'Phạm Thị D',
      phone: '0900000004',
      status: UserStatus.ACTIVE,
      isFirstLogin: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
      departmentId: rootDept.id,
      userRoles: {
        create: { roleId: docClerkRole!.id },
      },
    },
  });
  console.log('Document Clerk (root) seeded');

  // Seed 5 Document Clerks
  const clerkUsers = [
    { username: 'clerk02', email: 'clerk02@dms.local', fullName: 'Nguyễn Thị E', phone: '0900000010', departmentId: cnitDept.id },
    { username: 'clerk03', email: 'clerk03@dms.local', fullName: 'Trần Văn F', phone: '0900000011', departmentId: daoTaoDept.id },
    { username: 'clerk04', email: 'clerk04@dms.local', fullName: 'Lê Thị G', phone: '0900000012', departmentId: ctsvDept.id },
    { username: 'clerk05', email: 'clerk05@dms.local', fullName: 'Hoàng Văn H', phone: '0900000013', departmentId: dvsvDept.id },
  ];

  for (const clerk of clerkUsers) {
    await prisma.user.upsert({
      where: { username: clerk.username },
      update: {},
      create: {
        username: clerk.username,
        email: clerk.email,
        password: defaultHashedPassword,
        fullName: clerk.fullName,
        phone: clerk.phone,
        status: UserStatus.ACTIVE,
        isFirstLogin: true,
        createdBy: adminUser.id,
        updatedBy: adminUser.id,
        departmentId: clerk.departmentId,
        userRoles: {
          create: { roleId: docClerkRole!.id },
        },
      },
    });
  }
  console.log('5 Document Clerks seeded');

  // Seed 5 Specialists
  const specialistUsers = [
    { username: 'specialist02', email: 'specialist02@dms.local', fullName: 'Võ Thị I', phone: '0900000020', departmentId: cnitDept.id },
    { username: 'specialist03', email: 'specialist03@dms.local', fullName: 'Đặng Văn J', phone: '0900000021', departmentId: daoTaoDept.id },
    { username: 'specialist04', email: 'specialist04@dms.local', fullName: 'Bùi Thị K', phone: '0900000022', departmentId: ctsvDept.id },
    { username: 'specialist05', email: 'specialist05@dms.local', fullName: 'Phạm Văn L', phone: '0900000023', departmentId: dvsvDept.id },
    { username: 'specialist06', email: 'specialist06@dms.local', fullName: 'Trương Thị M', phone: '0900000024', departmentId: lanhDaoDept.id },
  ];

  for (const specialist of specialistUsers) {
    await prisma.user.upsert({
      where: { username: specialist.username },
      update: {},
      create: {
        username: specialist.username,
        email: specialist.email,
        password: defaultHashedPassword,
        fullName: specialist.fullName,
        phone: specialist.phone,
        status: UserStatus.ACTIVE,
        isFirstLogin: true,
        createdBy: adminUser.id,
        updatedBy: adminUser.id,
        departmentId: specialist.departmentId,
        userRoles: {
          create: { roleId: specialistRole!.id },
        },
      },
    });
  }
  console.log('5 Specialists seeded');

  // Seed 5 Department Heads
  const deptHeadUsers = [
    { username: 'depthead02', email: 'depthead02@dms.local', fullName: 'Ngô Văn N', phone: '0900000030', departmentId: cnitDept.id },
    { username: 'depthead03', email: 'depthead03@dms.local', fullName: 'Đỗ Thị O', phone: '0900000031', departmentId: daoTaoDept.id },
    { username: 'depthead04', email: 'depthead04@dms.local', fullName: 'Lý Văn P', phone: '0900000032', departmentId: ctsvDept.id },
    { username: 'depthead05', email: 'depthead05@dms.local', fullName: 'Hứa Thị Q', phone: '0900000033', departmentId: dvsvDept.id },
    { username: 'depthead06', email: 'depthead06@dms.local', fullName: 'Vũ Văn R', phone: '0900000034', departmentId: lanhDaoDept.id },
  ];

  for (const deptHead of deptHeadUsers) {
    await prisma.user.upsert({
      where: { username: deptHead.username },
      update: {},
      create: {
        username: deptHead.username,
        email: deptHead.email,
        password: defaultHashedPassword,
        fullName: deptHead.fullName,
        phone: deptHead.phone,
        status: UserStatus.ACTIVE,
        isFirstLogin: true,
        createdBy: adminUser.id,
        updatedBy: adminUser.id,
        departmentId: deptHead.departmentId,
        userRoles: {
          create: { roleId: deptHeadRole!.id },
        },
      },
    });
  }
  console.log('5 Department Heads seeded');

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

  // Backfill existing documents with default category (Document-side)
  const otherCategory = await prisma.documentCategory.findUnique({
    where: { code: 'OTHER' }
  });

  if (otherCategory) {
    const backfill = await prisma.document.updateMany({
      where: { categoryId: null },
      data: { categoryId: otherCategory.id }
    });
    console.log(`Backfilled category for ${backfill.count} documents`);
  }

  // Seed Document Types (Thể loại văn bản – UC-71 to UC-74)
  // isSystem = false so Document Clerk can manage these entries
  const documentTypes = [
    { code: 'CV',    name: 'CÔNG VĂN',          normalizedName: 'cong van',          description: 'Công văn hành chính' },
    { code: 'QĐ',    name: 'QUYẾT ĐỊNH',        normalizedName: 'quyet dinh',        description: 'Văn bản quyết định của cơ quan' },
    { code: 'NQ',    name: 'NGHỊ QUYẾT',        normalizedName: 'nghi quyet',        description: 'Văn bản nghị quyết của cơ quan' },
    { code: 'NĐ',    name: 'NGHỊ ĐỊNH',         normalizedName: 'nghi dinh',         description: 'Nghị định của Chính phủ' },
    { code: 'TB',    name: 'THÔNG BÁO',         normalizedName: 'thong bao',         description: 'Thông báo nội bộ và đối ngoại' },
    { code: 'BC',    name: 'BÁO CÁO',           normalizedName: 'bao cao',           description: 'Báo cáo định kỳ và đột xuất' },
    { code: 'KH',    name: 'KẾ HOẠCH',          normalizedName: 'ke hoach',          description: 'Kế hoạch công tác' },
    { code: 'TTr',   name: 'TỜ TRÌNH',          normalizedName: 'to trinh',          description: 'Tờ trình lên cấp trên' },
    { code: 'BB',    name: 'BIÊN BẢN',          normalizedName: 'bien ban',          description: 'Biên bản họp, kiểm tra' },
    { code: 'HD',    name: 'HƯỚNG DẪN',         normalizedName: 'huong dan',         description: 'Văn bản hướng dẫn nghiệp vụ' },
  
    // Bổ sung
    { code: 'CT',    name: 'CHỈ THỊ',           normalizedName: 'chi thi',           description: 'Văn bản chỉ thị' },
    { code: 'QC',    name: 'QUY CHẾ',           normalizedName: 'quy che',           description: 'Quy chế của cơ quan' },
    { code: 'QYĐ',   name: 'QUY ĐỊNH',          normalizedName: 'quy dinh',          description: 'Quy định của cơ quan' },
    { code: 'TC',    name: 'THÔNG CÁO',         normalizedName: 'thong cao',         description: 'Thông cáo' },
    { code: 'CTr',   name: 'CHƯƠNG TRÌNH',      normalizedName: 'chuong trinh',      description: 'Chương trình công tác' },
    { code: 'PA',    name: 'PHƯƠNG ÁN',         normalizedName: 'phuong an',         description: 'Phương án thực hiện' },
    { code: 'ĐA',    name: 'ĐỀ ÁN',             normalizedName: 'de an',             description: 'Đề án' },
    { code: 'DA',    name: 'DỰ ÁN',             normalizedName: 'du an',             description: 'Dự án' },
    { code: 'HĐ',    name: 'HỢP ĐỒNG',          normalizedName: 'hop dong',          description: 'Hợp đồng' },
    { code: 'CĐ',    name: 'CÔNG ĐIỆN',         normalizedName: 'cong dien',         description: 'Công điện' },
    { code: 'BGN',   name: 'BẢN GHI NHỚ',       normalizedName: 'ban ghi nho',       description: 'Biên bản ghi nhớ' },
    { code: 'BTT',   name: 'BẢN THỎA THUẬN',    normalizedName: 'ban thoa thuan',    description: 'Bản thỏa thuận' },
    { code: 'GUQ',   name: 'GIẤY ỦY QUYỀN',     normalizedName: 'giay uy quyen',     description: 'Giấy ủy quyền' },
    { code: 'GM',    name: 'GIẤY MỜI',          normalizedName: 'giay moi',          description: 'Giấy mời' },
    { code: 'GGT',   name: 'GIẤY GIỚI THIỆU',   normalizedName: 'giay gioi thieu',   description: 'Giấy giới thiệu' },
    { code: 'GNP',   name: 'GIẤY NGHỈ PHÉP',    normalizedName: 'giay nghi phep',    description: 'Giấy nghỉ phép' },
    { code: 'PG',    name: 'PHIẾU GỬI',         normalizedName: 'phieu gui',         description: 'Phiếu gửi' },
    { code: 'PC',    name: 'PHIẾU CHUYỂN',      normalizedName: 'phieu chuyen',      description: 'Phiếu chuyển' },
    { code: 'PB',    name: 'PHIẾU BÁO',         normalizedName: 'phieu bao',         description: 'Phiếu báo' },
    { code: 'TCG',   name: 'THƯ CÔNG',          normalizedName: 'thu cong',          description: 'Thư công' },
  
    { code: 'OTHER', name: 'KHÁC',              normalizedName: 'khac',              description: 'Các loại văn bản khác', isSystem: true },
  ];

  for (const type of documentTypes) {
    await prisma.documentType.upsert({
      where: { code: type.code },
      update: {},
      create: {
        ...type,
        isSystem: type.isSystem ?? false,
        createdById: adminUser.id,
      },
    });
  }
  console.log('Document Types seeded');

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
