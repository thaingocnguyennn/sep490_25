import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('=============================================');
  console.log('🔄 Bắt đầu dọn dẹp và reset database văn bản...');
  console.log('=============================================');

  // 1. Xóa các bảng liên kết chi tiết
  const delOutgoingEntries = await prisma.outgoingBookEntry.deleteMany({});
  console.log(`- Đã xóa ${delOutgoingEntries.count} OutgoingBookEntry`);

  const delIncomingEntries = await prisma.incomingBookEntry.deleteMany({});
  console.log(`- Đã xóa ${delIncomingEntries.count} IncomingBookEntry`);

  const delWorkflows = await prisma.documentWorkflow.deleteMany({});
  console.log(`- Đã xóa ${delWorkflows.count} DocumentWorkflow`);

  const delProcessors = await prisma.documentProcessor.deleteMany({});
  console.log(`- Đã xóa ${delProcessors.count} DocumentProcessor`);

  const delAttachments = await prisma.documentAttachment.deleteMany({});
  console.log(`- Đã xóa ${delAttachments.count} DocumentAttachment`);

  const delOutgoingDocs = await prisma.outgoingDocument.deleteMany({});
  console.log(`- Đã xóa ${delOutgoingDocs.count} OutgoingDocument`);

  const delIncomingDocs = await prisma.incomingDocument.deleteMany({});
  console.log(`- Đã xóa ${delIncomingDocs.count} IncomingDocument`);

  const delDocs = await prisma.document.deleteMany({});
  console.log(`- Đã xóa ${delDocs.count} Document`);

  // 2. Xóa các sổ văn bản cũ
  const delBooks = await prisma.documentBook.deleteMany({});
  console.log(`- Đã xóa ${delBooks.count} DocumentBook cũ`);

  // 3. Tái tạo Sổ văn bản đến và Sổ văn bản đi chuẩn theo Nghị định 30 (cấp cơ quan)
  const rootDept = await prisma.department.findFirst({
    where: { parentId: null },
  });

  const clerkUser = await prisma.user.findFirst({
    where: { username: 'clerk01' },
  });

  const currentYear = new Date().getFullYear();

  if (rootDept && clerkUser) {
    const incomingBook = await prisma.documentBook.create({
      data: {
        name: `Sổ văn bản đến ${currentYear}`,
        bookType: 'INCOMING',
        year: currentYear,
        currentNumber: 0,
        isDefault: true,
        status: 'ACTIVE',
        departmentId: rootDept.id,
        createdById: clerkUser.id,
      },
    });
    console.log(`- Đã tạo: "${incomingBook.name}" (ID: ${incomingBook.id}) - bắt đầu từ 0`);

    const outgoingBook = await prisma.documentBook.create({
      data: {
        name: `Sổ văn bản đi ${currentYear}`,
        bookType: 'OUTGOING',
        year: currentYear,
        currentNumber: 0,
        isDefault: true,
        status: 'ACTIVE',
        departmentId: rootDept.id,
        createdById: clerkUser.id,
      },
    });
    console.log(`- Đã tạo: "${outgoingBook.name}" (ID: ${outgoingBook.id}) - bắt đầu từ 0`);
  }

  console.log('=============================================');
  console.log('✅ Hoàn tất dọn dẹp và reset database sạch sẽ!');
  console.log('=============================================');
}

resetDatabase()
  .catch((e) => {
    console.error('❌ Lỗi khi reset database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
