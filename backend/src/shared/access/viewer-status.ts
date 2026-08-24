/**
 * Per-actor (per-viewer) status resolver for incoming documents.
 *
 * The global `Document.status` reflects the workflow's overall progress, so
 * two viewers looking at the same incoming document can reasonably see
 * different things:
 *   - The Document Clerk who created the document considers their work
 *     complete as soon as the document is filed and forwarded.
 *   - The Department Head / Specialist / assigned processor only sees
 *     "done" once their own step is finished.
 *
 * `resolveViewerStatus` computes a per-viewer status badge by walking the
 * document's `workflows[]` and `processors[]` arrays together with the
 * caller's identity. The global `Document.status` is left untouched; this
 * helper only projects a viewer-specific label.
 *
 * The helper never throws. For shapes it cannot classify it returns
 * `'IN_PROGRESS'`, which is the safe "still moving" default for an
 * in-flight incoming document.
 */

export type ViewerStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

interface ViewerWorkflowStep {
  id: number;
  stepOrder: number;
  roleName: string | null;
}

interface ViewerWorkflow {
  id: number;
  status: string;
  notes: string | null;
  completedAt: string | Date | null;
  workflowStep: ViewerWorkflowStep;
  user: { id: number } | null;
}

interface ViewerProcessor {
  id: number;
  processorType: string;
  completedAt: string | Date | null;
  user: { id: number };
}

export interface ViewerStatusDocument {
  /** Global document status. Used as the default and for terminal overrides. */
  status: string;
  /** Original creator (the Document Clerk who filed the document). */
  createdBy?: number | null;
  workflows?: ViewerWorkflow[] | null;
  processors?: ViewerProcessor[] | null;
}

/**
 * Resolve the status badge the supplied viewer should see for this document.
 */
export function resolveViewerStatus(
  doc: ViewerStatusDocument,
  userId: number,
  userRoles: readonly string[]
): ViewerStatus {
  const globalStatus = String(doc.status ?? 'PENDING').toUpperCase() as ViewerStatus;
  const roles = userRoles ?? [];
  const isAdmin = roles.includes('ADMIN');
  const isDeptHead = roles.includes('DEPARTMENT_HEAD');
  const isSpecialist = roles.includes('SPECIALIST');
  const isClerk = roles.includes('DOCUMENT_CLERK');

  // Admins always see the truth.
  if (isAdmin) {
    return globalStatus;
  }

  // Drafts are visible only to the creator and admins; everyone else would
  // not have access to them anyway because of `checkIncomingDocumentAccess`.
  // We still classify them so the badge is consistent.
  if (globalStatus === 'DRAFT') {
    return 'DRAFT';
  }

  // Terminal states are universal — everyone agrees the document is dead.
  if (
    globalStatus === 'REJECTED' ||
    globalStatus === 'CANCELLED' ||
    globalStatus === 'RETURNED'
  ) {
    return globalStatus;
  }

  const workflows = (doc.workflows ?? []).slice().sort(
    (a, b) => a.workflowStep.stepOrder - b.workflowStep.stepOrder
  );
  const processors = doc.processors ?? [];

  const clerkStep = workflows.find(
    (w) => w.workflowStep.stepOrder === 1 && w.workflowStep.roleName === 'DOCUMENT_CLERK'
  );
  const headStep = workflows.find(
    (w) => w.workflowStep.stepOrder === 2 && w.workflowStep.roleName === 'DEPARTMENT_HEAD'
  );
  const specialistStep = workflows.find(
    (w) => w.workflowStep.stepOrder === 3 && w.workflowStep.roleName === 'SPECIALIST'
  );

  // ── Document Clerk ────────────────────────────────────────────────────────
  // The clerk's own step (Tiếp nhận văn bản) is finished the moment the
  // document is filed and forwarded. Any user with the DOCUMENT_CLERK role
  // — not only the original creator — should see that step as "done"
  // because the work has been handed off regardless of which specific
  // clerk performed it. This is the per-actor behaviour requested by
  // UC-spec: a clerk scanning "All Incoming Documents" sees their pipeline
  // item as Hoàn thành while downstream actors keep seeing it as
  // Đang xử lý until their respective steps close.
  //
  // Falls through to the Department Head / Specialist branches if the
  // caller also holds those roles, so a multi-role user (e.g. a clerk who
  // is also a department head) gets the most-specific (downstream) view.
  if (isClerk && !isDeptHead && !isSpecialist && !isProcessorForDocument(processors, userId)) {
    if (clerkStep && isTerminalSuccess(clerkStep.status)) {
      return 'COMPLETED';
    }
    if (clerkStep && clerkStep.status === 'REJECTED') {
      return 'REJECTED';
    }
    // The step row exists but is still PENDING, or doesn't exist yet.
    // Either way the clerk's work has been handed off — show COMPLETED
    // when the document has progressed past the clerk stage (i.e. a
    // department-head workflow row exists and is no longer PENDING), and
    // show IN_PROGRESS only when the document is still sitting at the
    // clerk stage (head step still PENDING).
    if (headStep && headStep.status !== 'PENDING') {
      return 'COMPLETED';
    }
    return 'IN_PROGRESS';
  }

  // ── Department Head ─────────────────────────────────────────────────────
  if (isDeptHead && !isClerk && !isProcessorForDocument(processors, userId)) {
    if (!headStep) {
      return 'IN_PROGRESS';
    }
    if (headStep.status === 'COMPLETED') {
      // The head may have FORWARDED to a specialist; from the head's POV
      // their own step is done.
      return 'COMPLETED';
    }
    if (headStep.status === 'REJECTED') {
      // RETURN back to the clerk.
      return 'RETURNED';
    }
    if (headStep.status === 'CANCELLED') {
      return 'CANCELLED';
    }
    return 'IN_PROGRESS';
  }

  // ── Specialist / XLC / PHXL / XDB (assigned processors) ─────────────────
  const myProcessorRecord = processors.find((p) => p.user.id === userId);
  if (myProcessorRecord) {
    const myType = myProcessorRecord.processorType;

    // XLC carries the document through the specialist step.
    if (myType === 'XLC' && specialistStep) {
      if (specialistStep.status === 'COMPLETED') {
        return 'COMPLETED';
      }
      if (specialistStep.status === 'CANCELLED') {
        // RETURN from specialist to head.
        return 'RETURNED';
      }
      if (specialistStep.status === 'REJECTED') {
        return 'REJECTED';
      }
      // Their own processor row may have been completed even if the
      // specialist workflow row is still PENDING (e.g. they FINISHed and
      // the head is about to close out the workflow).
      if (myProcessorRecord.completedAt) {
        return 'COMPLETED';
      }
      return 'IN_PROGRESS';
    }

    // PHXL supports the XLC; once their processor row is closed out they
    // see their work as done even if the specialist row is still open.
    if (myType === 'PHXL') {
      if (myProcessorRecord.completedAt) {
        return 'COMPLETED';
      }
      return 'IN_PROGRESS';
    }

    // XDB is read-only — they only see the document as "done" once the
    // specialist closes it out.
    if (myType === 'XDB') {
      if (specialistStep && isTerminalSuccess(specialistStep.status)) {
        return 'COMPLETED';
      }
      if (specialistStep && specialistStep.status === 'CANCELLED') {
        return 'RETURNED';
      }
      return 'IN_PROGRESS';
    }
  }

  // ── Former processors (they acted on the workflow but were dropped from
  //    the processor set by a FORWARD) ─────────────────────────────────────
  const hasActedOnWorkflow = workflows.some((w) => w.user?.id === userId);
  if (hasActedOnWorkflow) {
    // If every workflow row they engaged with is in a terminal state,
    // show them COMPLETED. Otherwise show IN_PROGRESS.
    const mySteps = workflows.filter((w) => w.user?.id === userId);
    const allDone = mySteps.every((w) => isTerminalSuccess(w.status));
    if (allDone) return 'COMPLETED';
    return 'IN_PROGRESS';
  }

  // Default: stay neutral and surface "still moving" rather than the global
  // state, so unexpected shapes don't flash a misleading badge.
  return 'IN_PROGRESS';
}

function isProcessorForDocument(
  processors: ViewerProcessor[],
  userId: number
): boolean {
  return processors.some((p) => p.user.id === userId);
}

function isTerminalSuccess(status: string): boolean {
  return status === 'COMPLETED';
}