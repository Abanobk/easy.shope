import type pg from "pg";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_MODULES,
  type EffectivePermissions,
  type ModulePermission,
  type PermissionModule,
  type StaffRole,
  emptyPermissions,
  legacyFlatPermissionsToEffective,
  ownerPermissions,
} from "./permissions.js";

const STAFF_ROLES: StaffRole[] = ["store_manager", "sales", "fulfillment", "marketing", "viewer"];

function rowToModulePermission(row: {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}): ModulePermission {
  return {
    view: Boolean(row.can_view),
    create: Boolean(row.can_create),
    edit: Boolean(row.can_edit),
    delete: Boolean(row.can_delete),
  };
}

export function roleBypassesPermissions(role: string) {
  return role === "merchant_owner" || role === "platform_owner" || role === "platform_admin";
}

export async function ensureTenantRoleDefaults(pool: pg.Pool | pg.PoolClient, tenantId: string) {
  const existing = await pool.query(`SELECT id FROM tenant_role_permissions WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
  if (existing.rows[0]) return;

  for (const role of STAFF_ROLES) {
    const defaults = DEFAULT_ROLE_PERMISSIONS[role];
    for (const mod of PERMISSION_MODULES) {
      const p = defaults[mod.id];
      await pool.query(
        `INSERT INTO tenant_role_permissions (tenant_id, role, module, can_view, can_create, can_edit, can_delete)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id, role, module) DO NOTHING`,
        [tenantId, role, mod.id, p.view, p.create, p.edit, p.delete],
      );
    }
  }
}

export async function getRolePermissionsForTenant(pool: pg.Pool | pg.PoolClient, tenantId: string, role: StaffRole): Promise<EffectivePermissions> {
  await ensureTenantRoleDefaults(pool, tenantId);
  const rows = await pool.query(
    `SELECT module, can_view, can_create, can_edit, can_delete
     FROM tenant_role_permissions WHERE tenant_id = $1 AND role = $2`,
    [tenantId, role],
  );
  if (!rows.rows.length) return DEFAULT_ROLE_PERMISSIONS[role];
  const result = emptyPermissions();
  for (const row of rows.rows) {
    const module = row.module as PermissionModule;
    if (!result[module]) continue;
    result[module] = rowToModulePermission(row);
  }
  return result;
}

export async function saveRolePermissions(pool: pg.Pool, tenantId: string, role: StaffRole, permissions: EffectivePermissions) {
  await ensureTenantRoleDefaults(pool, tenantId);
  for (const mod of PERMISSION_MODULES) {
    const p = permissions[mod.id];
    await pool.query(
      `INSERT INTO tenant_role_permissions (tenant_id, role, module, can_view, can_create, can_edit, can_delete)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, role, module)
       DO UPDATE SET can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
                     can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete, updated_at = now()`,
      [tenantId, role, mod.id, p.view, p.create, p.edit, p.delete],
    );
  }
}

export async function getUserPermissionOverrides(pool: pg.Pool | pg.PoolClient, userId: string) {
  return pool.query(
    `SELECT module, can_view, can_create, can_edit, can_delete FROM user_permission_overrides WHERE user_id = $1`,
    [userId],
  );
}

export async function saveUserPermissionOverrides(pool: pg.Pool, userId: string, permissions: EffectivePermissions) {
  for (const mod of PERMISSION_MODULES) {
    const p = permissions[mod.id];
    await pool.query(
      `INSERT INTO user_permission_overrides (user_id, module, can_view, can_create, can_edit, can_delete)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, module)
       DO UPDATE SET can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
                     can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete, updated_at = now()`,
      [userId, mod.id, p.view, p.create, p.edit, p.delete],
    );
  }
}

export async function clearUserPermissionOverrides(pool: pg.Pool, userId: string) {
  await pool.query(`DELETE FROM user_permission_overrides WHERE user_id = $1`, [userId]);
}

function mergeOverride(base: ModulePermission, override: Partial<ModulePermission>): ModulePermission {
  return {
    view: override.view ?? base.view,
    create: override.create ?? base.create,
    edit: override.edit ?? base.edit,
    delete: override.delete ?? base.delete,
  };
}

export async function getEffectivePermissions(
  pool: pg.Pool | pg.PoolClient,
  input: {
    userId: string;
    tenantId: string;
    role: string;
    staffRole?: string | null;
    legacyPermissions?: unknown;
  },
): Promise<EffectivePermissions> {
  if (roleBypassesPermissions(input.role)) return ownerPermissions();

  const staffRole = (input.staffRole || "viewer") as StaffRole;
  const base =
    STAFF_ROLES.includes(staffRole) && input.tenantId
      ? await getRolePermissionsForTenant(pool, input.tenantId, staffRole)
      : DEFAULT_ROLE_PERMISSIONS.viewer;

  const legacy = Array.isArray(input.legacyPermissions) ? (input.legacyPermissions as string[]) : [];
  const legacyEffective = legacy.length ? legacyFlatPermissionsToEffective(legacy) : null;

  const overrides = await getUserPermissionOverrides(pool, input.userId);
  if (!overrides.rows.length && !legacyEffective) return base;

  const merged = { ...base };
  if (legacyEffective && !overrides.rows.length) {
    for (const mod of PERMISSION_MODULES) {
      const leg = legacyEffective[mod.id];
      if (leg.view || leg.create || leg.edit || leg.delete) {
        merged[mod.id] = { ...leg };
      }
    }
    return merged;
  }

  for (const row of overrides.rows) {
    const module = row.module as PermissionModule;
    if (!merged[module]) continue;
    merged[module] = mergeOverride(merged[module], {
      view: row.can_view ?? undefined,
      create: row.can_create ?? undefined,
      edit: row.can_edit ?? undefined,
      delete: row.can_delete ?? undefined,
    });
  }
  return merged;
}

export function effectivePermissionsToPayload(perms: EffectivePermissions) {
  const out: Record<string, ModulePermission> = {};
  for (const mod of PERMISSION_MODULES) {
    out[mod.id] = { ...perms[mod.id] };
  }
  return out;
}
