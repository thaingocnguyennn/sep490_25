import { default as prisma } from '../../config/database';

/**
 * Persist a system log entry. Centralised so callers do not need to import
 * Prisma and so we can later fan this out to remote audit sinks.
 */
export async function logSystemAction(params: {
  userId?: number | null;
  action: string;
  entityType?: string;
  entityId?: number;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: params.details,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[system-log] failed to persist log entry', error);
  }
}
