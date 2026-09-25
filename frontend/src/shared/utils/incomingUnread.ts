/**
 * Helpers for the Incoming Documents list and sidebar unread badge.
 *
 * The backend's `viewerStatus` field already encodes "this viewer has not
 * yet opened the document" — it resolves to `'PENDING'` exactly when the
 * calling user's participation row has `status = 'PENDING'` and
 * `viewedAt IS NULL`. We treat any such row as "Unread" for the list-bold
 * style and for the sidebar counter.
 *
 * Centralizing the predicate here keeps `IncomingDocumentsPage`,
 * `PendingIncomingDocumentsPage`, and the sidebar unread-count hook
 * aligned with each other.
 */

import type { IncomingDocumentListItem } from '../../api/modules/documents';

/**
 * Returns true when a single list item is still unread for the current
 * viewer. We honor a pre-set `viewerUnread` flag first (cheap, set by the
 * list annotators) and otherwise derive it from `viewerStatus`.
 *
 * We deliberately treat only `PENDING` rows as unread — terminal statuses
 * (`COMPLETED`, `RETURNED`, `REJECTED`, `CANCELLED`, `IN_PROGRESS`) all
 * imply the viewer has already opened the document (or — for XDB rows —
 * are not actionable in the first place).
 */
export function isIncomingItemUnread(item: IncomingDocumentListItem): boolean {
  if (item.viewerUnread !== undefined) return item.viewerUnread;
  const status = (item.document.viewerStatus ?? item.document.status ?? '').toUpperCase();
  return status === 'PENDING';
}

/**
 * Annotate a list of items with the precomputed `viewerUnread` flag.
 * Returns a new array — the original items are not mutated so React
 * change-detection (referential identity) keeps working downstream.
 */
export function annotateIncomingUnread<T extends IncomingDocumentListItem>(items: T[]): T[] {
  return items.map((item) => ({ ...item, viewerUnread: isIncomingItemUnread(item) }));
}

/**
 * Count unread items across a list (or a single item).
 */
export function countIncomingUnread(items: IncomingDocumentListItem[]): number {
  return items.reduce((acc, item) => acc + (isIncomingItemUnread(item) ? 1 : 0), 0);
}
