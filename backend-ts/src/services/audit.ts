import { prisma } from '@config/database';
import { logger } from '@utils/logger';

interface AuditLogData {
  entity: string;
  entityId: string;
  action: string;
  byUserId: string;
  companyId: string;
  snapshot?: any;
  changes?: any;
}

export class AuditService {
  static async log(data: AuditLogData): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          entity: data.entity,
          entityId: data.entityId,
          action: data.action,
          byUserId: data.byUserId,
          companyId: data.companyId,
          snapshot: data.snapshot || null,
          changes: data.changes || null,
        },
      });

      logger.debug('Audit log created', data);
    } catch (error) {
      logger.error('Failed to create audit log:', error);
      // Don't throw error to prevent disrupting main flow
    }
  }

  static async getAuditLogs(companyId: string, filters: {
    entity?: string;
    entityId?: string;
    byUserId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  } = {}) {
    const {
      entity,
      entityId,
      byUserId,
      action,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = filters;

    const where: any = { companyId };
    
    if (entity) where.entity = entity;
    if (entityId) where.entityId = entityId;
    if (byUserId) where.byUserId = byUserId;
    if (action) where.action = action;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          byUser: {
            select: { id: true, name: true, email: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}