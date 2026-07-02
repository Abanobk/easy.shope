import crypto from "node:crypto";
import type pg from "pg";

type Db = Pick<pg.Pool, "query">;

export type AccountingLink = {
  tenant_id: string;
  enabled: boolean;
  cash_base_url: string;
  cash_tenant_slug: string | null;
  integration_secret: string | null;
  sync_products_to_cash: boolean;
  sync_products_from_cash: boolean;
  sync_orders_to_cash: boolean;
  accounting_status: string;
  accounting_plan_code: string | null;
  accounting_expires_at: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
};

export function generateIntegrationSecret() {
  return crypto.randomBytes(24).toString("hex");
}

export type CashTenantMatch = {
  slug: string;
  name: string;
  cashTenantId: number;
};

export async function assertCashSlugAvailable(db: Db, tenantId: string, slug: string) {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return;
  const conflict = await db.query(
    `SELECT tenant_id FROM tenant_accounting_links
     WHERE lower(cash_tenant_slug) = $1 AND tenant_id <> $2
     LIMIT 1`,
    [normalized, tenantId],
  );
  if (conflict.rows[0]) {
    throw new Error(`شركة Easy Cash «${normalized}» مربوطة بمتجر Easy Shope آخر`);
  }
}

export async function discoverCashTenantsByEmail(cashBaseUrl: string, email: string): Promise<CashTenantMatch[]> {
  const base = cashBaseUrl.replace(/\/$/, "");
  const secret = process.env.SHOPE_INTEGRATION_SECRET;
  if (!secret) throw new Error("SHOPE_INTEGRATION_SECRET غير مضبوط على الخادم");
  const response = await fetch(`${base}/api/integration/shope/lookup-by-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shope-Integration-Secret": secret,
    },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; matches?: CashTenantMatch[] };
  if (!response.ok) throw new Error(String(data.error || `Easy Cash HTTP ${response.status}`));
  return data.matches ?? [];
}

export async function getMerchantOwnerEmail(db: Db, tenantId: string) {
  const res = await db.query(`SELECT email FROM users WHERE tenant_id = $1 AND role = 'merchant_owner' LIMIT 1`, [tenantId]);
  return (res.rows[0]?.email as string | undefined) ?? null;
}

export async function getAccountingLink(db: Db, tenantId: string): Promise<AccountingLink | null> {
  const res = await db.query(`SELECT * FROM tenant_accounting_links WHERE tenant_id = $1`, [tenantId]);
  return (res.rows[0] as AccountingLink | undefined) ?? null;
}

export async function upsertAccountingLink(
  db: Db,
  tenantId: string,
  patch: Partial<Omit<AccountingLink, "tenant_id">> & { cash_tenant_slug?: string },
) {
  const existing = await getAccountingLink(db, tenantId);
  const nextSlug = patch.cash_tenant_slug ?? existing?.cash_tenant_slug;
  if (nextSlug) await assertCashSlugAvailable(db, tenantId, nextSlug);
  const secret = patch.integration_secret ?? existing?.integration_secret ?? generateIntegrationSecret();
  await db.query(
    `INSERT INTO tenant_accounting_links (
      tenant_id, enabled, cash_base_url, cash_tenant_slug, integration_secret,
      sync_products_to_cash, sync_products_from_cash, sync_orders_to_cash,
      accounting_status, accounting_plan_code, accounting_expires_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
    ON CONFLICT (tenant_id) DO UPDATE SET
      enabled = COALESCE(EXCLUDED.enabled, tenant_accounting_links.enabled),
      cash_base_url = COALESCE(EXCLUDED.cash_base_url, tenant_accounting_links.cash_base_url),
      cash_tenant_slug = COALESCE(EXCLUDED.cash_tenant_slug, tenant_accounting_links.cash_tenant_slug),
      integration_secret = COALESCE(EXCLUDED.integration_secret, tenant_accounting_links.integration_secret),
      sync_products_to_cash = COALESCE(EXCLUDED.sync_products_to_cash, tenant_accounting_links.sync_products_to_cash),
      sync_products_from_cash = COALESCE(EXCLUDED.sync_products_from_cash, tenant_accounting_links.sync_products_from_cash),
      sync_orders_to_cash = COALESCE(EXCLUDED.sync_orders_to_cash, tenant_accounting_links.sync_orders_to_cash),
      accounting_status = COALESCE(EXCLUDED.accounting_status, tenant_accounting_links.accounting_status),
      accounting_plan_code = COALESCE(EXCLUDED.accounting_plan_code, tenant_accounting_links.accounting_plan_code),
      accounting_expires_at = COALESCE(EXCLUDED.accounting_expires_at, tenant_accounting_links.accounting_expires_at),
      updated_at = now()`,
    [
      tenantId,
      patch.enabled ?? existing?.enabled ?? false,
      patch.cash_base_url ?? existing?.cash_base_url ?? "https://cash.easytecheg.net",
      patch.cash_tenant_slug ?? existing?.cash_tenant_slug ?? null,
      secret,
      patch.sync_products_to_cash ?? existing?.sync_products_to_cash ?? true,
      patch.sync_products_from_cash ?? existing?.sync_products_from_cash ?? true,
      patch.sync_orders_to_cash ?? existing?.sync_orders_to_cash ?? true,
      patch.accounting_status ?? existing?.accounting_status ?? "inactive",
      patch.accounting_plan_code ?? existing?.accounting_plan_code ?? null,
      patch.accounting_expires_at ?? existing?.accounting_expires_at ?? null,
    ],
  );
  return getAccountingLink(db, tenantId);
}

async function logSync(
  db: Db,
  tenantId: string,
  direction: string,
  entityType: string,
  entityId: string | null,
  status: "ok" | "error",
  message: string,
) {
  await db.query(
    `INSERT INTO integration_sync_log (tenant_id, direction, entity_type, entity_id, status, message) VALUES ($1,$2,$3,$4,$5,$6)`,
    [tenantId, direction, entityType, entityId, status, message.slice(0, 2000)],
  );
  await db.query(
    `UPDATE tenant_accounting_links SET last_sync_at = now(), last_sync_error = $2, updated_at = now() WHERE tenant_id = $1`,
    [tenantId, status === "error" ? message.slice(0, 500) : null],
  );
}

async function saveEntityMap(db: Db, tenantId: string, entityType: string, shopeId: string, cashId: string, code: string | null) {
  await db.query(
    `INSERT INTO integration_entity_maps (tenant_id, entity_type, shope_id, cash_id, code)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id, entity_type, shope_id) DO UPDATE SET cash_id = EXCLUDED.cash_id, code = EXCLUDED.code`,
    [tenantId, entityType, shopeId, cashId, code],
  );
}

async function cashRequest(link: AccountingLink, path: string, body: unknown) {
  const base = link.cash_base_url.replace(/\/$/, "");
  const secret = process.env.SHOPE_INTEGRATION_SECRET ?? link.integration_secret;
  if (!link.cash_tenant_slug) throw new Error("cash_tenant_slug غير مضبوط");
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shope-Integration-Secret": secret ?? "",
      "X-Tenant-Slug": link.cash_tenant_slug,
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error || data.message || `Easy Cash HTTP ${response.status}`));
  return data;
}

function productCode(product: { id: string; sku?: string | null; slug?: string }) {
  return (product.sku || product.slug || product.id).trim();
}

export async function syncProductToAccounting(db: Db, tenantId: string, product: Record<string, unknown>) {
  const link = await getAccountingLink(db, tenantId);
  if (!link?.enabled || !link.sync_products_to_cash || !link.cash_tenant_slug) return null;
  try {
    const code = productCode(product as { id: string; sku?: string | null; slug?: string });
    const price = (Number(product.price_cents ?? 0) / 100).toFixed(2);
    const stock = String(product.stock_quantity ?? 0);
    const data = await cashRequest(link, "/api/integration/shope/items/upsert", {
      code,
      barcode: code,
      name: String(product.title_ar || product.title_en || code),
      salePrice: price,
      purchasePrice: price,
      currentStock: stock,
      description: product.description ?? null,
      isActive: product.status === "published",
    });
    const itemId = String(data.itemId ?? "");
    if (itemId) await saveEntityMap(db, tenantId, "product_item", String(product.id), itemId, code);
    await logSync(db, tenantId, "shope_to_cash", "product", String(product.id), "ok", `item ${data.action} ${code}`);
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logSync(db, tenantId, "shope_to_cash", "product", String(product.id), "error", message);
    throw error;
  }
}

export async function syncItemFromAccountingToShope(
  db: Db,
  tenantId: string,
  item: {
    code: string;
    name: string;
    salePrice?: string;
    currentStock?: string;
    barcode?: string;
    description?: string;
    cashItemId?: number | string;
  },
) {
  const link = await getAccountingLink(db, tenantId);
  if (!link?.enabled || !link.sync_products_from_cash) return null;
  const code = item.code.trim();
  const map = await db.query(
    `SELECT shope_id FROM integration_entity_maps WHERE tenant_id = $1 AND entity_type = 'product_item' AND code = $2 LIMIT 1`,
    [tenantId, code],
  );
  const priceCents = Math.round(Number(item.salePrice ?? 0) * 100);
  const stock = Math.max(0, Math.floor(Number(item.currentStock ?? 0)));
  const slugBase = code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `item-${Date.now()}`;

  if (map.rows[0]?.shope_id) {
    await db.query(
      `UPDATE products SET title_ar = $2, title_en = $3, price_cents = $4, stock_quantity = $5, sku = $6
       WHERE id = $1 AND tenant_id = $7`,
      [map.rows[0].shope_id, item.name, item.name, priceCents, stock, code, tenantId],
    );
    await logSync(db, tenantId, "cash_to_shope", "product", String(map.rows[0].shope_id), "ok", `updated ${code}`);
    return { productId: map.rows[0].shope_id, action: "updated" };
  }

  let slug = slugBase;
  for (let i = 0; i < 5; i++) {
    const clash = await db.query(`SELECT id FROM products WHERE tenant_id = $1 AND slug = $2`, [tenantId, slug]);
    if (!clash.rows[0]) break;
    slug = `${slugBase}-${i + 1}`;
  }
  const inserted = await db.query(
    `INSERT INTO products (tenant_id, title_ar, title_en, slug, price_cents, sku, stock_quantity, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft') RETURNING *`,
    [tenantId, item.name, item.name, slug, priceCents, code, stock],
  );
  const product = inserted.rows[0];
  if (item.cashItemId) await saveEntityMap(db, tenantId, "product_item", product.id, String(item.cashItemId), code);
  await logSync(db, tenantId, "cash_to_shope", "product", product.id, "ok", `created ${code}`);
  return { productId: product.id, action: "created" };
}

export async function syncOrderToAccounting(db: Db, orderId: string) {
  const orderRes = await db.query(
    `SELECT o.*, t.slug AS tenant_slug FROM orders o JOIN tenants t ON t.id = o.tenant_id WHERE o.id = $1`,
    [orderId],
  );
  const order = orderRes.rows[0] as Record<string, unknown> | undefined;
  if (!order) return null;
  const tenantId = String(order.tenant_id);
  const link = await getAccountingLink(db, tenantId);
  if (!link?.enabled || !link.sync_orders_to_cash || !link.cash_tenant_slug) return null;
  if (order.accounting_invoice_synced) return { duplicate: true };

  const itemsRes = await db.query(
    `SELECT oi.*, p.sku, p.slug FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1`,
    [orderId],
  );
  const lines = [];
  for (const row of itemsRes.rows as Array<Record<string, unknown>>) {
    const code = (row.sku as string) || (row.slug as string) || String(row.product_id);
    const qty = String(row.quantity);
    const unit = (Number(row.unit_price_cents) / 100).toFixed(2);
    const total = (Number(row.total_cents) / 100).toFixed(2);
    lines.push({ code, quantity: qty, price: unit, total });
  }
  if (!lines.length) return null;

  try {
    const subtotal = (Number(order.total_cents) / 100).toFixed(2);
    const data = await cashRequest(link, "/api/integration/shope/invoices/from-order", {
      externalOrderId: orderId,
      customer: {
        code: String(order.customer_phone || order.customer_email || orderId),
        name: String(order.customer_name || "عميل متجر"),
        phone: order.customer_phone ?? null,
        email: order.customer_email ?? null,
      },
      date: new Date(String(order.created_at)).toISOString().slice(0, 10),
      subtotal,
      total: subtotal,
      skipStockDeduction: true,
      notes: `Easy Shope · ${order.tenant_slug}`,
      items: lines,
    });
    await db.query(`UPDATE orders SET accounting_invoice_synced = true, accounting_invoice_ref = $2 WHERE id = $1`, [
      orderId,
      String(data.number ?? data.invoiceId ?? ""),
    ]);
    await logSync(db, tenantId, "shope_to_cash", "order", orderId, "ok", `invoice ${data.number ?? data.invoiceId}`);
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logSync(db, tenantId, "shope_to_cash", "order", orderId, "error", message);
    throw error;
  }
}

export async function maybeSyncOrderToAccounting(db: Db, orderId: string, paymentStatus: string) {
  if (paymentStatus !== "paid") return null;
  try {
    return await syncOrderToAccounting(db, orderId);
  } catch (error) {
    console.error("[accounting-sync] order", orderId, error);
    return null;
  }
}
