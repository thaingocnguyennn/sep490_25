import { default as prisma } from '../../config/database';
import { ForbiddenError } from '../exceptions/app-error';
import { incomingDocumentsRepository } from '../../modules/incoming-documents/incoming-documents.repository';

/**
 * Stage identifiers used to match a workflow step to the role permitted to act on it.
 */
export type WorkflowStage =
  | 'DOCUMENT_CLERK'
  | 'DEPARTMENT_HEAD'
  | 'SPECIALIST'
  | 'ARCHIVE'
  | 'UNKNOWN';

/**
 * Resolve the workflow stage from the canonical `WorkflowStep.roleName`. The
 * `ARCHIVE` step intentionally has a null `roleName` and is treated as a
 * system-only stage.
 */
export function resolveStageFromRoleName(
  roleName: string | null | undefined
): WorkflowStage {
  switch (roleName) {
    case 'DOCUMENT_CLERK':
      return 'DOCUMENT_CLERK';
    case 'DEPARTMENT_HEAD':
      return 'DEPARTMENT_HEAD';
    case 'SPECIALIST':
      return 'SPECIALIST';
    case null:
    case undefined:
      return 'ARCHIVE';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Build the set of roles authorised to act on a workflow step. ADMIN may act
 * on every step (escape hatch), and the per-stage role is required for everyone
 * else.
 */
export function rolesForStage(stage: WorkflowStage): string[] {
  if (stage === 'ARCHIVE' || stage === 'UNKNOWN') {
    return ['ADMIN'];
  }
  return [stage, 'ADMIN'];
}

/**
 * Decide whether the supplied roles grant access to act on a workflow step.
 * Mirrors the gating that `requireRole` would apply if it had access to the
 * step's role. The helper exists so the service layer can refuse mutations
 * even when a route is reachable.
 */
export function canActOnStage(
  stage: WorkflowStage,
  userRoles: string[]
): boolean {
  const allowed = rolesForStage(stage);
  return allowed.some((role) => userRoles.includes(role));
}

/**
 * Resolve the documentId for a given incoming document id.
 */
async function resolveDocumentId(incomingId: number): Promise<number | null> {
  const doc = await prisma.incomingDocument.findUnique({
    where: { id: incomingId },
    select: { documentId: true },
  });
  return doc?.documentId ?? null;
}

/**
 * Centralised access check used by every endpoint that reads or mutates an
 * incoming document.
 *
 * Rules:
 * - ADMIN bypasses every check.
 * - The clerk that originally created the document (`Document.createdBy`) bypasses.
 * - Any user who has acted on the document's workflow (i.e. has at least one
 *   `DocumentWorkflow.userId` row pointing at them) bypasses. This keeps former
 *   processors visible to themselves after a FORWARD / TRANSFER re-assigns
 *   the processor set and drops them from `DocumentProcessor`. The workflow
 *   row's `userId` is a permanent historical record of "I worked on this
 *   document", so it's the right anchor for read access.
 * - DEPT_HEAD / SPECIALIST users must have a `DocumentProcessor` record of type
 *   XLC, PHXL or XDB on the document.
 * - Any other authenticated user without a processor record is forbidden.
 */
export async function checkIncomingDocumentAccess(
  incomingId: number,
  userId: number,
  userRoles: string[]
): Promise<void> {
  const incoming = await incomingDocumentsRepository.findById(incomingId);

  const isAdmin = userRoles.includes('ADMIN');
  const isCreator = incoming.document.createdBy === userId;

  if (isAdmin || isCreator) return;

  // Former processors / heads who have acted on this document's workflow keep
  // read access even after a FORWARD / TRANSFER re-assigns the processor set.
  const hasActedOnWorkflow = incoming.document.workflows.some(
    (w) => w.user?.id === userId
  );
  if (hasActedOnWorkflow) return;

  const processorRecord = incoming.document.processors.find(
    (p) => p.user.id === userId
  );

  if (!processorRecord) {
    throw new ForbiddenError('Bạn không có quyền truy cập văn bản này');
  }

  const restrictedRoles = ['DEPARTMENT_HEAD', 'SPECIALIST'];
  const hasRestrictedRole = restrictedRoles.some((r) => userRoles.includes(r));
  if (hasRestrictedRole) {
    const allowedTypes = ['XLC', 'PHXL', 'XDB'];
    if (!allowedTypes.includes(processorRecord.processorType)) {
      throw new ForbiddenError('Bạn không có quyền truy cập văn bản này');
    }
  }
}

/**
 * Verify the user is allowed to update the given workflow step.
 * - ADMIN always allowed.
 * - Otherwise the step's stage role must be present in the user's roles.
 */
export async function checkWorkflowStepAccess(
  workflowId: number,
  userRoles: string[]
): Promise<{ documentId: number; stage: WorkflowStage }> {
  if (userRoles.includes('ADMIN')) {
    const wf = await prisma.documentWorkflow.findUnique({
      where: { id: workflowId },
      include: { workflowStep: true },
    });
    if (!wf) {
      throw new ForbiddenError('Không tìm thấy bước xử lý');
    }
    return {
      documentId: wf.documentId,
      stage: resolveStageFromRoleName(wf.workflowStep.roleName),
    };
  }

  const wf = await prisma.documentWorkflow.findUnique({
    where: { id: workflowId },
    include: { workflowStep: true },
  });
  if (!wf) {
    throw new ForbiddenError('Không tìm thấy bước xử lý');
  }

  const stage = resolveStageFromRoleName(wf.workflowStep.roleName);
  if (!canActOnStage(stage, userRoles)) {
    throw new ForbiddenError(
      'Bạn không có quyền cập nhật bước xử lý này'
    );
  }
  return { documentId: wf.documentId, stage };
}

/**
 * For endpoints that key off the document id (e.g. generic `documents` module
 * preview/download), verify access to the underlying incoming document when one
 * exists.
 */
export async function checkDocumentAccess(
  documentId: number,
  userId: number,
  userRoles: string[]
): Promise<void> {
  const incoming = await prisma.incomingDocument.findUnique({
    where: { documentId },
    select: { id: true },
  });
  if (incoming) {
    await checkIncomingDocumentAccess(incoming.id, userId, userRoles);
    return;
  }

  // Outgoing / archival / internal documents fall back to a simple ownership
  // check. ADMIN bypasses; everyone else must be the creator or have an
  // explicit processor record (outgoing module handles its own ACL).
  if (userRoles.includes('ADMIN')) return;

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      processors: { select: { userId: true, processorType: true } },
    },
  });
  if (!doc) {
    throw new ForbiddenError('Không tìm thấy văn bản');
  }
  if (doc.createdBy === userId) return;
  const isProcessor = doc.processors.some((p) => p.userId === userId);
  if (!isProcessor) {
    throw new ForbiddenError('Bạn không có quyền truy cập văn bản này');
  }
}

/**
 * Convenience: resolve document id from incoming id or null if not found.
 */
export { resolveDocumentId };
