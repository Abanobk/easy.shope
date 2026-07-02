import type { FastifyRequest } from "fastify";
import type pg from "pg";
import {
  type PermissionAction,
  type PermissionModule,
  hasPermission,
  ownerPermissions,
} from "./permissions.js";
import { getEffectivePermissions } from "./permissions-service.js";

type TenantAuthUser = {
  userId: string;
  tenantId: string;
  role: string;
};

type MerchantCtx = {
  user: TenantAuthUser;
  permissions: ReturnType<typeof ownerPermissions>;
  bypass: boolean;
};

const ctxCache = new WeakMap<FastifyRequest, MerchantCtx>();

export function httpError(message: string, status = 400) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = status;
  return error;
}

export async function getMerchantCtx(
  pool: pg.Pool,
  request: FastifyRequest,
  requireUser: (request: FastifyRequest) => TenantAuthUser,
): Promise<MerchantCtx> {
  const cached = ctxCache.get(request);
  if (cached) return cached;

  const user = requireUser(request);
  if (user.role === "merchant_owner") {
    const ctx: MerchantCtx = { user, permissions: ownerPermissions(), bypass: true };
    ctxCache.set(request, ctx);
    return ctx;
  }

  const row = await pool.query(
    `SELECT status, staff_role, permissions FROM users WHERE id = $1 AND tenant_id = $2`,
    [user.userId, user.tenantId],
  );
  const dbUser = row.rows[0];
  if (!dbUser) throw httpError("User not found", 404);
  if (dbUser.status !== "active") throw httpError("This account is disabled", 403);

  const permissions = await getEffectivePermissions(pool, {
    userId: user.userId,
    tenantId: user.tenantId,
    role: user.role,
    staffRole: dbUser.staff_role as string | null,
    legacyPermissions: dbUser.permissions,
  });

  const ctx: MerchantCtx = { user, permissions, bypass: false };
  ctxCache.set(request, ctx);
  return ctx;
}

export async function requirePerm(
  pool: pg.Pool,
  request: FastifyRequest,
  requireUser: (request: FastifyRequest) => TenantAuthUser,
  module: PermissionModule,
  action: PermissionAction,
) {
  const ctx = await getMerchantCtx(pool, request, requireUser);
  if (!ctx.bypass && !hasPermission(ctx.permissions, module, action)) {
    throw httpError("ليس لديك صلاحية لهذا الإجراء.", 403);
  }
  return ctx.user;
}

export async function loadPermissionProfile(pool: pg.Pool, userId: string, tenantId: string | null, role: string) {
  if (role === "merchant_owner") {
    return { staffRole: null, effectivePermissions: ownerPermissions(), bypass: true, legacyPermissions: [] };
  }
  const row = await pool.query(`SELECT staff_role, permissions FROM users WHERE id = $1`, [userId]);
  const staffRole = (row.rows[0]?.staff_role as string | null) ?? "viewer";
  const effectivePermissions = tenantId
    ? await getEffectivePermissions(pool, {
        userId,
        tenantId,
        role,
        staffRole,
        legacyPermissions: row.rows[0]?.permissions,
      })
    : ownerPermissions();
  return {
    staffRole,
    effectivePermissions,
    bypass: false,
    legacyPermissions: Array.isArray(row.rows[0]?.permissions) ? row.rows[0].permissions : [],
  };
}
