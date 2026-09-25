/**
 * Polls the Incoming Documents list with `status=PENDING` and surfaces
 * the `total` field as the unread count for the current viewer.
 *
 * Why we reuse the list endpoint instead of adding a new backend route:
 *  - The backend's `findAll` already produces per-viewer counts thanks
 *    to `viewerStatus` resolution (`backend/src/shared/access/viewer-status.ts`).
 *  - Returns `total = count of rows whose viewerStatus resolves to PENDING
 *    for the caller` — exactly the "Unread" set.
 *  - Adding a new endpoint would require a backend migration / route /
 *    controller / service plumbing for zero functional gain.
 *
 * Real-time updates:
 *  - The hook subscribes to `incomingUnreadSignal`, a tiny pub/sub
 *    used to bridge the `IncomingDocumentDetail` page (which has no
 *    direct reference to this hook) with the sidebar badge. When the
 *    detail page calls `markViewed()` it publishes a `decrement(1)`
 *    so the badge drops immediately — without waiting for the next
 *    poll tick.
 *  - The interval keeps the cached value honest so any drift (e.g.
 *    another user / device marked a doc read in the meantime, or
 *    the optimistic decrement was wrong by 1) is reconciled
 *    within `intervalMs`. The first poll after a decrement is also
 *    a cheap belt-and-braces reconciliation.
 *
 * Important: the optimistic decrement is intentionally an UNGUARDED
 * `decrement(1)` rather than a "was the doc previously unread?" check.
 * A previous implementation read `doc.document.viewerStatus` to guard
 * the decrement, but the detail page fetches `doc` AFTER `markViewed`
 * has already set `viewedAt` server-side — so the guard always saw
 * `IN_PROGRESS` and skipped the decrement (i.e. it bypassed itself
 * exactly when it should have fired). The polling tick reconciles any
 * over-decrement within `intervalMs`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { incomingDocumentsApi } from '../../../api';
import { incomingUnreadSignal } from '../state/incomingUnreadSignal';

interface UseIncomingUnreadCountOptions {
  /** Polling interval in milliseconds. Defaults to 15000 (15s) — matches
   *  the cadence used by the Outgoing unprocessed counter. */
  intervalMs?: number;
  /** Disable polling (used in tests / non-mounted callers). */
  enabled?: boolean;
}

interface UseIncomingUnreadCountResult {
  unreadCount: number;
  /** Force a re-fetch (e.g. when returning from the detail page). */
  refresh: () => void;
}

export function useIncomingUnreadCount(
  options: UseIncomingUnreadCountOptions = {}
): UseIncomingUnreadCountResult {
  const { intervalMs = 15000, enabled = true } = options;
  const [unreadCount, setUnreadCount] = useState(() =>
    incomingUnreadSignal.getUnreadCount()
  );
  const inflight = useRef(false);

  const fetchCount = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      // We pass `limit: 1` because we only need the `total` field —
      // no actual rows are materialized on the frontend.
      const { data } = await incomingDocumentsApi.getAll({
        page: 1,
        limit: 1,
        status: 'PENDING',
      });
      const count = data.data?.total ?? 0;
      // Publish to the signal so other hooks / future callers stay in
      // sync, and update our own local state via the subscription.
      incomingUnreadSignal.syncFromBackend(count);
    } catch {
      // Silently ignore — the badge is a best-effort signal. We never
      // want to surface a "could not load count" alert to the sidebar.
    } finally {
      inflight.current = false;
    }
  }, []);

  // Subscribe to the cross-component signal so the badge updates
  // immediately when the detail page calls `markViewed`. The polling
  // effect below ALSO writes to the signal via `syncFromBackend`, but
  // that call lands up to `intervalMs` later — the optimistic
  // decrement from `incomingUnreadSignal.decrement()` is what makes
  // the badge feel instant.
  useEffect(() => {
    const unsubscribe = incomingUnreadSignal.subscribe((count) => {
      setUnreadCount(count);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchCount();
    const id = setInterval(fetchCount, intervalMs);
    return () => clearInterval(id);
  }, [enabled, fetchCount, intervalMs]);

  return { unreadCount, refresh: fetchCount };
}
