/**
 * One-shot backfill of DocumentWorkflowParticipation rows for any documents
 * created before the per-user workflow state model existed. Idempotent: it
 * short-circuits when participations already exist.
 *
 * Usage:
 *   npx ts-node prisma/backfill-workflow-participations.ts
 *
 * What it does:
 *   1) For every Document with type=INCOMING and at least one DocumentProcessor
 *      row, create a participation row per processor with role XLC/PHXL/XDB.
 *   2) For every DocumentWorkflow row with a userId, create a participation
 *      row with role matching the workflow step's roleName (DOCUMENT_CLERK /
 *      DEPARTMENT_HEAD / SPECIALIST).
 *   3) For documents with a creator but no DocumentWorkflow/DocumentProcessor
 *      rows, create a CLERK participation row for the creator.
 *
 * Status inference:
 *   - DocumentWorkflow.status === COMPLETED -> status=COMPLETED, completedAt set
 *   - DocumentWorkflow.status === REJECTED  -> status=RETURNED, returnedAt set
 *   - DocumentWorkflow.status === CANCELLED -> status=CANCELLED
 *   - DocumentWorkflow.status === IN_PROGRESS/PENDING -> status=PENDING
 *
 * Run on the same database used by the backend. Re-running after the first
 * successful run is a no-op because the existence guard short-circuits.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.documentWorkflowParticipation.count();
  if (existing > 0) {
    console.log(`[backfill] ${existing} participation rows already exist — skipping.`);
    return;
  }

  const incomingDocs = await prisma.incomingDocument.findMany({
    select: {
      id: true,
      documentId: true,
      document: {
        select: {
          id: true,
          type: true,
          status: true,
          createdBy: true,
          processors: {
            select: { userId: true, processorType: true },
          },
          workflows: {
            select: {
              userId: true,
              status: true,
              completedAt: true,
              workflowStep: { select: { id: true, roleName: true } },
            },
          },
        },
      },
    },
  });

  let created = 0;

  for (const incoming of incomingDocs) {
    const doc = incoming.document;
    if (doc.type !== 'INCOMING') continue;
    const documentId = doc.id;

    // 1) Processor participations (XLC / PHXL / XDB).
    //
    // Important: XDB ("Xem để biết") rows are *read-only observers*. They
    // have no workflow to "complete", so they must NEVER be auto-set to
    // COMPLETED even when the document itself has reached a terminal state.
    // The previous implementation wrongly promoted XDB rows to COMPLETED
    // whenever Document.status === 'COMPLETED', which leaked "Hoàn thành"
    // into the XDB user's list. Keep XDB rows PENDING regardless of the
    // document's global status. PHXL and XLC follow the document's
    // terminal state because those roles have a real "complete" event.
    for (const proc of doc.processors) {
      let status: string;
      if (proc.processorType === 'XDB') {
        status = 'PENDING';
      } else if (doc.status === 'COMPLETED') {
        status = 'COMPLETED';
      } else if (doc.status === 'RETURNED' || doc.status === 'REJECTED') {
        status = 'RETURNED';
      } else {
        status = 'PENDING';
      }
      await prisma.documentWorkflowParticipation.upsert({
        where: {
          documentId_userId_participationRole: {
            documentId,
            userId: proc.userId,
            participationRole: proc.processorType,
          },
        },
        update: {},
        create: {
          documentId,
          userId: proc.userId,
          participationRole: proc.processorType,
          status,
        },
      });
      created += 1;
    }

    // 2) Workflow participations (CLERK / HEAD / SPECIALIST).
    for (const wf of doc.workflows) {
      if (!wf.userId) continue;
      const role = wf.workflowStep.roleName ?? 'CLERK';
      let status = 'PENDING';
      let completedAt: Date | null = null;
      let returnedAt: Date | null = null;
      if (wf.status === 'COMPLETED') {
        status = 'COMPLETED';
        completedAt = wf.completedAt ?? new Date();
      } else if (wf.status === 'REJECTED') {
        status = 'RETURNED';
        returnedAt = wf.completedAt ?? new Date();
      } else if (wf.status === 'CANCELLED') {
        status = 'CANCELLED';
      }
      await prisma.documentWorkflowParticipation.upsert({
        where: {
          documentId_userId_participationRole: {
            documentId,
            userId: wf.userId,
            participationRole: role,
          },
        },
        update: {},
        create: {
          documentId,
          userId: wf.userId,
          participationRole: role,
          workflowStepId: wf.workflowStep.id,
          status,
          completedAt,
          returnedAt,
        },
      });
      created += 1;
    }

    // 3) CLERK participation for the original creator if no workflow row exists.
    if (doc.createdBy && !doc.workflows.some((w) => w.userId === doc.createdBy)) {
      let status = 'PENDING';
      let completedAt: Date | null = null;
      let returnedAt: Date | null = null;
      if (doc.status === 'COMPLETED') {
        status = 'COMPLETED';
      } else if (doc.status === 'RETURNED' || doc.status === 'REJECTED') {
        status = 'RETURNED';
      }
      await prisma.documentWorkflowParticipation.upsert({
        where: {
          documentId_userId_participationRole: {
            documentId,
            userId: doc.createdBy,
            participationRole: 'CLERK',
          },
        },
        update: {},
        create: {
          documentId,
          userId: doc.createdBy,
          participationRole: 'CLERK',
          status,
          completedAt,
          returnedAt,
        },
      });
      created += 1;
    }
  }

  console.log(`[backfill] created ${created} participation rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
