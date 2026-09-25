/**
 * Tiny pub/sub for the Incoming-unread badge.
 *
 * Why a signal module? When the IncomingDocumentDetail page calls
 * `incomingDocumentsApi.markViewed(id)` and the backend sets the
 * viewer's `viewedAt`, the sidebar badge must reflect the change as
 * soon as possible — without waiting for the 15s polling tick. The
 * detail page has no direct handle on the hook living inside
 * `MainLayout`, so we need a lightweight bridge.
 *
 * Design:
 *  - One module-level singleton, shared across the app (mount/unmount
 *    safe — listeners are per-callback, not per-instance).
 *  - `markRead(documentId)` decrements the cached count immediately and
 *    notifies subscribers. The detail page calls this after
 *    `markViewed()` resolves successfully.
 *  - `syncFromBackend(count)` replaces the cached count (used by the
 *    polling hook when it gets a real value from the backend).
 *  - `subscribe(listener)` returns an unsubscribe function. The hook
 *    registers its listener once and unsubscribes on unmount.
 *  - `getUnreadCount()` lets call sites that already know they cannot
 *    wait for the next tick read the current cached value.
 *
 * The model is intentionally simple — no Redux / Zustand. The only
 * state held here is the unread count.
 */

let cachedUnreadCount = 0;
type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function emit(count: number) {
  const before = cachedUnreadCount;
  cachedUnreadCount = Math.max(0, count);
  for (const listener of listeners) {
    try {
      listener(cachedUnreadCount);
    } catch {
      // A broken listener should not stop the others from receiving the
      // event. We deliberately swallow; the hook's own listener is
      // idempotent because it just calls setState.
    }
  }
}

export const incomingUnreadSignal = {
  /**
   * Replace the cached count with an authoritative value, usually from
   * the polling hook after a successful `GET /incoming-documents?
   * status=PENDING`. Notifies all subscribers.
   */
  syncFromBackend(count: number) {
    emit(count);
  },

  /**
   * Decrement the cached count by `delta` (default 1) and notify
   * subscribers. Bounds the result at 0 — never goes negative.
   *
   * Called by the detail page right after `markViewed()` resolves.
   * The decrement is intentionally unconditional because
   * `markViewed` is server-side idempotent: re-marking an already-read
   * document is a no-op for `viewedAt`, so the count should still
   * drop by 0 on the backend side, but if the user just re-opens a
   * doc the badge can over-decrement slightly — which the polling
   * reconcile fixes within `intervalMs`.
   *
   * We previously tried to read the doc's `viewerStatus` first to
   * guard against this, but the detail page fetches `doc` AFTER
   * `markViewed` resolves (since `markViewed` is what flipped
   * `viewedAt` on the backend). That race made the guard bypass the
   * decrement exactly when it should fire. Removing the guard is the
   * correct fix.
   */
  decrement(delta = 1) {
    emit(cachedUnreadCount - delta);
  },

  /**
   * Optimistically increment the cached count by 1 and notify
   * subscribers. Not currently used by the runtime but exposed so
   * future "newly-assigned document" surfaces (push notifications,
   * real-time events) can light up the badge without waiting for the
   * next poll.
   */
  increment(delta = 1) {
    emit(cachedUnreadCount + delta);
  },

  /** Read the latest cached count without subscribing. */
  getUnreadCount(): number {
    return cachedUnreadCount;
  },

  /**
   * Subscribe to count updates. Returns an unsubscribe function — call
   * it on unmount to avoid leaking listeners.
   */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    // Push the current value immediately so new subscribers don't
    // render the wrong count on their first render.
    try {
      listener(cachedUnreadCount);
    } catch {
      // Ignore — same rationale as `emit`.
    }
    return () => {
      listeners.delete(listener);
    };
  },
};
