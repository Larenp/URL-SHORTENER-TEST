import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { hasPermission } from '../authorization/authorization.util';
import { Permission } from '../authorization/permission.enum';
import { generateUniqueShortCode } from './url-code.util';
import {
  ShortCodeAlreadyExistsException,
  ShortCodeGenerationFailedException,
  UrlNotFoundException,
} from './exceptions/url.exception';
import type { CreateUrlDto } from './dto/create-url.dto';
import type { UpdateUrlDto } from './dto/update-url.dto';
import type { ListUrlsQueryDto } from './dto/list-urls-query.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Prisma } from '@prisma/client';
import type { Url } from '@prisma/client';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const UNIQUE_CONSTRAINT_ERROR_CODE = 'P2002';

@Injectable()
export class UrlService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateUrlDto, currentUser: JwtPayload): Promise<Url> {
    const isUniqueConstraintError = (error: unknown): boolean =>
      isPrismaUniqueConstraintError(error, 'shortCode');

    if (dto.customCode) {
      try {
        return await this.tenantPrisma.client.url.create({
          data: {
            shortCode: dto.customCode,
            originalUrl: dto.originalUrl,
            title: dto.title,
            createdById: currentUser.sub,
          } as unknown as Prisma.UrlCreateInput,
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ShortCodeAlreadyExistsException(dto.customCode);
        }
        throw error;
      }
    }

    try {
      return await generateUniqueShortCode(
        (candidate) =>
          this.tenantPrisma.client.url.create({
            data: {
              shortCode: candidate,
              originalUrl: dto.originalUrl,
              title: dto.title,
              createdById: currentUser.sub,
            } as unknown as Prisma.UrlCreateInput,
          }),
        isUniqueConstraintError,
      );
    } catch {
      throw new ShortCodeGenerationFailedException();
    }
  }

  async findAll(query: ListUrlsQueryDto): Promise<PaginatedResult<Url>> {
    const where: Record<string, unknown> = { deletedAt: null };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { originalUrl: { contains: query.search, mode: 'insensitive' } },
        { shortCode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.tenantPrisma.client.url.findMany({ where, skip, take: query.limit }),
      this.tenantPrisma.client.url.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string): Promise<Url> {
    const url = await this.tenantPrisma.client.url.findUnique({ where: { id, deletedAt: null } });

    if (!url) {
      throw new UrlNotFoundException();
    }

    return url;
  }

  async update(id: string, dto: UpdateUrlDto, currentUser: JwtPayload): Promise<Url> {
    const url = await this.findOne(id);
    this.assertCanManage(url, currentUser);

    return this.tenantPrisma.client.url.update({
      where: { id },
      data: { ...dto },
    });
  }

  async remove(id: string, currentUser: JwtPayload): Promise<void> {
    const url = await this.findOne(id);
    this.assertCanManage(url, currentUser);

    await this.tenantPrisma.client.url.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * MEMBER may manage a URL they created themselves (URL_MANAGE_OWN, which
   * every role has); TENANT_ADMIN may manage any URL in the tenant
   * (URL_MANAGE, admin-only). This is resource-specific — "own" isn't
   * knowable from the route or the JWT alone, only by comparing the
   * fetched resource's creator to the caller — which is exactly why this
   * lives here rather than as a route-level @RequirePermissions() check.
   */
  private assertCanManage(url: Url, currentUser: JwtPayload): void {
    const isOwner = url.createdById === currentUser.sub;
    const canManageAny = hasPermission(currentUser.role, Permission.URL_MANAGE);

    if (!isOwner && !canManageAny) {
      throw new ForbiddenException('You do not have permission to manage this URL');
    }
  }
}

function isPrismaUniqueConstraintError(error: unknown, field: string): boolean {
  if (typeof error === 'object' && error !== null) {
    const knownError = error as { code?: unknown; meta?: { target?: unknown } };
    if (knownError.code === UNIQUE_CONSTRAINT_ERROR_CODE) {
      const target = knownError.meta?.target;
      if (Array.isArray(target)) {
        return target.includes(field);
      }
      if (typeof target === 'string') {
        return target.includes(field);
      }
    }
  }
  return false;
}
