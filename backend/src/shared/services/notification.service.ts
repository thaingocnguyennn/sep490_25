import { default as prisma } from '../../config/database';

/**
 * Persist an in-app notification for a single user. Wrapped in try/catch
 * because notifications are best-effort observability, never block the
 * transactional mutation.
 */
export async function emitNotificationToUser(
  userId: number,
  title: string,
  message: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, title, message },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[notification] failed to persist notification', error);
  }
}

/**
 * Persist the same notification for many users. Used by FORWARD/TRANSFER
 * to fan out notifications to every newly-assigned processor.
 */
export async function emitNotificationToUsers(
  userIds: number[],
  title: string,
  message: string
): Promise<void> {
  const uniqueIds = Array.from(new Set(userIds.filter((id) => Number.isInteger(id))));
  if (uniqueIds.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: uniqueIds.map((userId) => ({ userId, title, message })),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[notification] failed to persist notifications', error);
  }
}
