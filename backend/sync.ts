import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function sync() {
  console.log('Start');
  const incomingDocs = await prisma.document.findMany({
    where: {
      type: 'INCOMING',
      incomingDocuments: {
        none: {}
      }
    }
  });

  for (const doc of incomingDocs) {
    console.log('Syncing INCOMING doc:', doc.id);
    await prisma.incomingDocument.create({
      data: {
        documentId: doc.id,
        dateReceived: new Date(),
        issuer: doc.sendingAgency || '',
        departmentId: doc.departmentId
      }
    });
  }

  const outgoingDocs = await prisma.document.findMany({
    where: {
      type: 'OUTGOING',
      outgoingDocuments: {
        none: {}
      }
    }
  });

  for (const doc of outgoingDocs) {
    console.log('Syncing OUTGOING doc:', doc.id);
    await prisma.outgoingDocument.create({
      data: {
        documentId: doc.id,
        recipientName: 'Chưa cập nhật',
        sentDate: new Date()
      }
    });
  }

  console.log('Done syncing. Incoming:', incomingDocs.length, 'Outgoing:', outgoingDocs.length);
}

sync().catch(console.error).finally(() => prisma.$disconnect());
