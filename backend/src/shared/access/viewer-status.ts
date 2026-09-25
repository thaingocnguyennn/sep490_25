/**
 * Per-actor (per-viewer) status resolver for incoming documents.
 *
 * This resolver reads `DocumentWorkflowParticipation` rows — a per-user
 * join table that records every actor's workflow state, first-view
 * timestamp, and completion/return markers. The global `Document.status`
 * is **not** used directly: the same document can present different
 * statuses to different users.
 *
 * UI mapping (Vietnamese):
 *   PENDING       → Chờ xử lý
 *   IN_PROGRESS   → Đang xử lý
 *   COMPLETED     → Hoàn thành
 *   RETURNED      → Trả lại
 *   CANCELLED     → Trả lại (a participation that was force-cancelled is
 *                       treated as RETURNED from the actor's POV — they
 *                       never completed their workflow)
 *   REJECTED      → Trả lại
 *   DRAFT         → Bản nháp (only the clerk sees this when the document
 *                       is still in DRAFT status and they have not
 *                       submitted it)
 *
 * Edge cases:
 *   - ADMIN sees the global Document.status verbatim (the "source of
 *     truth" view) so admins can audit the workflow.
 *   - A user with multiple participations (e.g. a clerk who is also
 *     assigned as XLC) gets the most-specific role's status. Specificity
 *     order: CLERK < XDB < XLC/PHXL < DEPARTMENT_HEAD/SPECIALIST.
 *     Department-head and specialist participations win over processor
 *     participations because they map directly to workflow steps. XDB is
 *     ranked between CLERK and XLC because it is read-only and never
 *     overlaps with active workflow steps.
 *   - XDB ("Xem để biết") participations are passive observers. They have
 *     no workflow actions, so the row is mapped to:
 *       - PENDING     when the observer has not opened the document yet
 *                     (Chờ xử lý)
 *       - COMPLETED   once the observer has opened the document. Reading the
 *                     document is the observer's only action, so the row is
 *                     marked Hoàn thành ("completed") on first view. Any
 *                     earlier terminal status on the XDB row (e.g. a backfill
 *                     that inherited the global Document.status) is treated
 *                     the same way and demoted to COMPLETED as long as a
 *                     viewedAt timestamp exists.
 */

export type ViewerStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export type ParticipationRole =
  | 'CLERK'
  | 'DEPARTMENT_HEAD'
  | 'SPECIALIST'
  | 'XLC'
  | 'PHXL'
  | 'XDB';

export interface ViewerParticipation {
  id: number;
  status: string;
  participationRole: string;
  viewedAt: string | Date | null;
  completedAt: string | Date | null;
  returnedAt: string | Date | null;
}

export interface ViewerStatusDocument {
  /** Global document status. Used as a default for ADMIN and for
   *  clerk-on-DRAFT inference. */
  status: string;
  /** Original creator (the Document Clerk who filed the document). */
  createdBy?: number | null;
  /** Per-actor participation rows for this viewer. */
  participations?: ViewerParticipation[] | null;
}

/**
 * Resolve the status badge the supplied viewer should see for this document.
 *
 * Reads exclusively from `participations`. Returns 'IN_PROGRESS' as a safe
 * default if the caller has no participation rows (which should not happen
 * for any user with access, but the default is defensive).
 */
export function resolveViewerStatus(
  doc: ViewerStatusDocument,
  userId: number,
  userRoles: readonly string[]
): ViewerStatus {
  const globalStatus = String(doc.status ?? 'PENDING').toUpperCase() as ViewerStatus;
  const roles = userRoles ?? [];
  const isAdmin = roles.includes('ADMIN');

  // Admins always see the truth.
  if (isAdmin) {
    return globalStatus;
  }

  // Clerk in DRAFT — the document has not been submitted yet, so the
  // creator's status is Bản nháp.
  if (globalStatus === 'DRAFT') {
    if (doc.createdBy === userId || roles.includes('DOCUMENT_CLERK')) {
      return 'DRAFT';
    }
    // Other roles should not normally see drafts (access-checked), but
    // if they do, fall through to participation-based resolution.
  }

  const participations = (doc.participations ?? []).filter(
    (p) => p && (p as ViewerParticipation).participationRole
  ) as ViewerParticipation[];

  // No participations — defensive default.
  if (participations.length === 0) {
    return globalStatus === 'RETURNED' ? 'RETURNED' : 'IN_PROGRESS';
  }

  // Pick the "winning" participation for this user. Specificity:
  //   1) Department Head / Specialist (workflow-step roles) win over
  //      processor sub-roles (XLC/PHXL/XDB).
  //   2) Clerk is the most generic role — fall through to it only if
  //      no other participation exists.
  const sorted = [...participations].sort(
    (a, b) => specificityRank(b.participationRole) - specificityRank(a.participationRole)
  );
  const winner = sorted[0];

  return mapParticipationStatus(
    winner.status,
    winner.viewedAt,
    winner.returnedAt,
    winner.participationRole
  );
}

/**
 * Map a participation row's raw status into the viewer-visible enum.
 *
 * - 'PENDING'   + viewedAt == null  → PENDING (Chờ xử lý)
 * - 'PENDING'   + viewedAt != null  → IN_PROGRESS (Đang xử lý)
 * - 'IN_PROGRESS'                   → IN_PROGRESS
 * - 'COMPLETED'                     → COMPLETED (Hoàn thành)
 * - 'RETURNED'                      → RETURNED (Trả lại)
 * - 'REJECTED'                      → RETURNED (Trả lại) — preserved as
 *                                       separate enum value for callers
 *                                       that want to distinguish, but the
 *                                       UI label is Trả lại.
 * - 'CANCELLED'                     → RETURNED (Trả lại) — from the
 *                                       actor's POV, a cancelled
 *                                       participation is indistinguishable
 *                                       from a return.
 *
 * @param participationRole The role this participation row represents.
 *   XDB ("Xem để biết" / read-only observer) participations are special:
 *   XDB users have no workflow action to perform, but reading the document
 *   IS their only action. Once they have opened the document (viewedAt set)
 *   the row resolves to COMPLETED (Hoàn thành). If the row has not yet been
 *   opened it resolves to PENDING (Chờ xử lý). The terminal-status
 *   defensive guard is preserved: any pre-existing COMPLETED/RETURNED/…
 *   value on an XDB row collapses to COMPLETED once viewedAt is non-null,
 *   and to PENDING if viewedAt is still null.
 */
export function mapParticipationStatus(
  rawStatus: string,
  viewedAt: string | Date | null,
  _returnedAt: string | Date | null,
  participationRole?: string
): ViewerStatus {
  const normalized = String(rawStatus ?? 'PENDING').toUpperCase() as ViewerStatus;

  // XDB participations are read-only observers. Their only meaningful
  // event is the first view:
  //   - not viewed yet   → PENDING (Chờ xử lý)
  //   - viewed at least once → COMPLETED (Hoàn thành)
  // The original status on the row (whether PENDING, IN_PROGRESS,
  // COMPLETED, RETURNED, etc.) does not change this — for an XDB user the
  // badge is driven solely by viewedAt.
  if (String(participationRole ?? '').toUpperCase() === 'XDB') {
    return viewedAt ? 'COMPLETED' : 'PENDING';
  }

  if (normalized === 'COMPLETED') return 'COMPLETED';
  if (normalized === 'RETURNED') return 'RETURNED';
  if (normalized === 'REJECTED') return 'REJECTED';
  if (normalized === 'CANCELLED') return 'RETURNED';
  if (normalized === 'IN_PROGRESS') return 'IN_PROGRESS';
  // PENDING — only stays PENDING if the user has not opened yet.
  if (viewedAt) return 'IN_PROGRESS';
  return 'PENDING';
}

/**
 * Lower number = more generic role. Used to pick the "winning" participation
 * for a multi-role user. XDB is intentionally ranked between CLERK and
 * XLC/PHXL so that an active-processor user who is also added as an XDB
 * observer on the same document still resolves to their active-processor
 * row (the row that drives a real workflow action).
 */
function specificityRank(role: string): number {
  switch (role) {
    case 'DEPARTMENT_HEAD':
    case 'SPECIALIST':
      return 30;
    case 'XLC':
    case 'PHXL':
      return 20;
    case 'XDB':
      return 15;
    case 'CLERK':
      return 10;
    default:
      return 0;
  }
}
