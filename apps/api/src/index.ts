import compress from "@fastify/compress";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import pg from "pg";
import { z } from "zod";
import { restoreOrderStock, reserveOrderStock } from "./inventory.js";
import {
  discoverCashTenantsByEmail,
  getAccountingLink,
  getMerchantOwnerEmail,
  maybeSyncOrderToAccounting,
  syncItemFromAccountingToShope,
  syncProductToAccounting,
  upsertAccountingLink,
} from "./accounting-integration.js";
import { emailNotificationsConfigured, notifyNewStoreOrder, notifyOrderStatusChange } from "./notifications.js";
import { handleCreateStoreOrder, handleStoreCheckoutQuote } from "./create-store-order.js";
import { carrierTrackingUrl, parseStoreSettings, publicCheckoutConfig } from "./store-settings.js";

const { Pool } = pg;

const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://easy_shope:easy_shope_dev@postgres:5432/easy_shope",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "dev-only-change-me",
  platformOwnerEmail: process.env.PLATFORM_OWNER_EMAIL ?? "owner@easyshope.local",
  platformOwnerPassword: process.env.PLATFORM_OWNER_PASSWORD ?? "ChangeMe123!",
  nodeEnv: process.env.NODE_ENV ?? "development",
  /** Fine-grained PAT or classic PAT: `repo`, `workflow` — لتشغيل workflow بناء الـ APK */
  githubActionsDispatchToken: process.env.GITHUB_ACTIONS_DISPATCH_TOKEN ?? "",
  /** مثل Abanobk/easy.shope — نفس مستودع الـ API عادةً */
  githubRepository: process.env.GITHUB_REPOSITORY ?? "",
  /** اسم ملف الـ workflow تحت .github/workflows/ */
  androidBuildWorkflowFile: process.env.ANDROID_BUILD_WORKFLOW_FILE ?? "build-tenant-apk.yml",
  /** يطابق سر GitHub Actions عند استدعاء /api/internal/android-build/callback */
  androidBuildCallbackSecret: process.env.ANDROID_BUILD_CALLBACK_SECRET ?? "",
  /** فرع GitHub المستخدم عند workflow_dispatch (مثلاً main) */
  githubDispatchRef: process.env.GITHUB_DISPATCH_REF ?? "main",
  shopeIntegrationSecret: process.env.SHOPE_INTEGRATION_SECRET ?? "",
  smtpHost: process.env.SMTP_HOST?.trim() ?? "",
};

const PLACEHOLDER_SECRET_MARKERS = ["dev-only", "change-this", "changeme", "change_me", "easy_shope_dev"];

function isPlaceholderSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return PLACEHOLDER_SECRET_MARKERS.some((marker) => normalized.includes(marker));
}

function assertProductionSecrets() {
  if (env.nodeEnv !== "production") return;
  const issues: string[] = [];
  if (isPlaceholderSecret(env.jwtSecret)) issues.push("JWT_SECRET");
  if (isPlaceholderSecret(env.encryptionKey)) issues.push("ENCRYPTION_KEY");
  if (isPlaceholderSecret(env.platformOwnerPassword)) issues.push("PLATFORM_OWNER_PASSWORD");
  if (issues.length) {
    app.log.error(`Production is using placeholder secrets: ${issues.join(", ")}. Update .env on the server before accepting real payments.`);
  }
  if (!emailNotificationsConfigured()) {
    app.log.warn("SMTP_HOST is not configured — order email notifications are disabled.");
  }
}

type AuthUser = {
  userId: string;
  tenantId: string | null;
  role: "platform_owner" | "platform_admin" | "merchant_owner" | "merchant_staff" | "customer";
};

type TenantAuthUser = AuthUser & { tenantId: string };

const pool = new Pool({ connectionString: env.databaseUrl });
const app = Fastify({ logger: true, bodyLimit: 15 * 1024 * 1024 });

if (env.nodeEnv === "production" && [env.jwtSecret, env.encryptionKey, env.platformOwnerPassword].some((value) => isPlaceholderSecret(value))) {
  app.log.warn("Production is using placeholder secrets. Update .env before handling real customers or payments.");
}

assertProductionSecrets();

await app.register(cors, { origin: true });
await app.register(compress, { global: true, threshold: 1024 });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      message: "Invalid request data",
      issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  const appError = error as Error & { statusCode?: number };
  const statusCode = appError.statusCode || 500;
  return reply.code(statusCode).send({ message: appError.message || "Unexpected server error" });
});

function httpError(message: string, statusCode = 400) {
  const error = new Error(message);
  (error as Error & { statusCode: number }).statusCode = statusCode;
  return error;
}

function signToken(user: AuthUser) {
  return jwt.sign(user, env.jwtSecret, { expiresIn: "7d" });
}

function getAuth(request: { headers: Record<string, string | string[] | undefined> }): AuthUser | null {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(value.slice("Bearer ".length), env.jwtSecret) as AuthUser;
  } catch {
    return null;
  }
}

function requireAuth(request: Parameters<typeof getAuth>[0]) {
  const user = getAuth(request);
  if (!user) {
    const error = new Error("Unauthorized");
    (error as Error & { statusCode: number }).statusCode = 401;
    throw error;
  }
  return user;
}

function requirePlatformOwner(request: Parameters<typeof getAuth>[0]) {
  const user = requireAuth(request);
  if (!["platform_owner", "platform_admin"].includes(user.role)) {
    const error = new Error("Forbidden");
    (error as Error & { statusCode: number }).statusCode = 403;
    throw error;
  }
  return user;
}

function requireTenantUser(request: Parameters<typeof getAuth>[0]): TenantAuthUser {
  const user = requireAuth(request);
  if (!user.tenantId) {
    const error = new Error("Tenant required");
    (error as Error & { statusCode: number }).statusCode = 403;
    throw error;
  }
  return { ...user, tenantId: user.tenantId };
}

function requireMerchantOwner(request: Parameters<typeof getAuth>[0]): TenantAuthUser {
  const user = requireTenantUser(request);
  if (user.role !== "merchant_owner") {
    throw httpError("Only the merchant owner can manage staff", 403);
  }
  return user;
}

function requireMerchantUser(request: Parameters<typeof getAuth>[0]): TenantAuthUser {
  const user = requireTenantUser(request);
  if (!["merchant_owner", "merchant_staff"].includes(user.role)) {
    throw httpError("Merchant account required", 403);
  }
  return user;
}

/// Granular permissions that the merchant owner can grant to staff accounts.
const STAFF_PERMISSION_KEYS = ["orders", "products", "categories", "settings", "providers", "billing", "android"] as const;

function sanitizeStaffPermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(STAFF_PERMISSION_KEYS);
  const out = new Set<string>();
  for (const item of input) {
    if (typeof item === "string" && allowed.has(item)) out.add(item);
  }
  return Array.from(out);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const mediaUrlSchema = z
  .string()
  .max(5_000_000)
  .refine((value) => /^https?:\/\//i.test(value) || /^data:(image|video)\//i.test(value), "Media must be a URL or uploaded image/video data");

const productVariantSchema = z.object({
  type: z.string().trim().optional(),
  color: z.string().trim().optional(),
  extraPriceCents: z.number().int().nonnegative().default(0),
  stockQuantity: z.number().int().nonnegative().nullable().optional(),
});

function encodeSecret(value: unknown) {
  const key = crypto.createHash("sha256").update(env.encryptionKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify({ ...((value as Record<string, unknown>) ?? {}), keyHint: env.encryptionKey.slice(0, 4) });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decodeSecret<T>(value: string): T {
  if (value.startsWith("v1:")) {
    const [, iv, tag, encrypted] = value.split(":");
    const key = crypto.createHash("sha256").update(env.encryptionKey).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
    return JSON.parse(decrypted) as T;
  }
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as T;
}

async function migrateEncryptedSecrets() {
  const tenantCredentials = await pool.query(`SELECT id, encrypted_secret FROM tenant_payment_credentials WHERE encrypted_secret <> '' AND encrypted_secret NOT LIKE 'v1:%'`);
  for (const row of tenantCredentials.rows) {
    await pool.query(`UPDATE tenant_payment_credentials SET encrypted_secret = $1 WHERE id = $2`, [encodeSecret(decodeSecret(row.encrypted_secret)), row.id]);
  }

  const platformCredentials = await pool.query(`SELECT id, encrypted_secret FROM platform_payment_credentials WHERE encrypted_secret <> '' AND encrypted_secret NOT LIKE 'v1:%'`);
  for (const row of platformCredentials.rows) {
    await pool.query(`UPDATE platform_payment_credentials SET encrypted_secret = $1 WHERE id = $2`, [encodeSecret(decodeSecret(row.encrypted_secret)), row.id]);
  }
}

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "Customer", lastName: parts.slice(1).join(" ") || "Guest" };
}

function absoluteUrl(request: { headers: Record<string, string | string[] | undefined> }, path: string) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const hostHeader = forwardedHost ?? request.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto || "https"}://${host || "shope.easytecheg.net"}${path}`;
}

function paymobCheckoutUrl(publicKey: string, clientSecret: string) {
  const params = new URLSearchParams({
    publicKey,
    clientSecret,
  });
  return `https://accept.paymob.com/unifiedcheckout/?${params.toString()}`;
}

function isLikelyPaymobPublicKey(value: unknown) {
  const key = String(value || "").trim();
  return /(^|_)pk(_|l_|t_|test_|live_)/i.test(key) || /^pkt_/i.test(key) || /^pkl_/i.test(key);
}

function assertPaymobPublicKey(publicKey: unknown) {
  if (!isLikelyPaymobPublicKey(publicKey)) {
    throw httpError("Paymob Public Key غير صحيح. افتح Paymob > Developers > API Keys وانسخ Public Key الذي يبدأ غالبًا بـ pk أو egy_pk، وليس API Token أو Secret.", 400);
  }
}

function paymobErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Paymob rejected the payment request";
  const body = payload as Record<string, unknown>;
  const direct = body.message || body.detail || body.error;
  if (typeof direct === "string") return direct;
  const errors: string[] = Object.entries(body)
    .map(([key, value]): string => {
      if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
      if (typeof value === "string") return `${key}: ${value}`;
      if (value && typeof value === "object") return `${key}: ${paymobErrorMessage(value)}`;
      return "";
    })
    .filter(Boolean);
  return errors.join(" | ") || "Paymob rejected the payment request";
}

function paymobField(obj: Record<string, unknown>, path: string) {
  if (path === "order.id" && obj.order && typeof obj.order !== "object") return obj.order;
  return path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), obj);
}

function paymobHmacMatches(obj: Record<string, unknown>, hmacSecret: string, receivedHmac: string) {
  if (!hmacSecret) return env.nodeEnv !== "production";
  if (!receivedHmac) return false;
  const fields = [
    "amount_cents",
    "created_at",
    "currency",
    "error_occured",
    "has_parent_transaction",
    "id",
    "integration_id",
    "is_3d_secure",
    "is_auth",
    "is_capture",
    "is_refunded",
    "is_standalone_payment",
    "is_voided",
    "order.id",
    "owner",
    "pending",
    "source_data.pan",
    "source_data.sub_type",
    "source_data.type",
    "success",
  ];
  const message = fields.map((field) => String(paymobField(obj, field) ?? "")).join("");
  const expected = crypto.createHmac("sha512", hmacSecret).update(message).digest("hex");
  const received = receivedHmac.toLowerCase();
  return expected.length === received.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function parseSubscriptionInvoiceReference(reference: string) {
  if (!reference.startsWith("subscription_invoice:")) return "";
  return reference.split(":")[1] || "";
}

function paymobTransactionState(obj: Record<string, unknown>) {
  return {
    success: obj.success === true || obj.success === "true",
    pending: obj.pending === true || obj.pending === "true",
    transactionId: String(obj.id || obj.transaction_id || obj.payment_key_claims || ""),
  };
}

async function expireOverdueSubscriptions() {
  await pool.query(
    `UPDATE tenants
     SET status = 'expired'
     WHERE subscription_expires_at IS NOT NULL
       AND subscription_expires_at < now()
       AND status NOT IN ('suspended', 'expired')`,
  );
}

async function getPlatformSetting(key: string, fallback: string): Promise<string> {
  const result = await pool.query(`SELECT value FROM platform_settings WHERE key = $1`, [key]);
  return result.rows[0]?.value ?? fallback;
}

async function setPlatformSetting(key: string, value: string) {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [key, value],
  );
}

async function getTrialDaysDefault(): Promise<number> {
  const raw = await getPlatformSetting("trial_days_default", "30");
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(n, 365);
}

async function markSubscriptionInvoicePaid(invoiceId: string, providerReference?: string | null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoice = await client.query(
      `SELECT invoices.*, plans.duration_months
       FROM platform_subscription_invoices invoices
       JOIN plans ON plans.code = invoices.plan_code
       WHERE invoices.id = $1
       FOR UPDATE`,
      [invoiceId],
    );
    const row = invoice.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    if (row.status === "paid") {
      await client.query("COMMIT");
      return row;
    }
    const updatedInvoice = await client.query(
      `UPDATE platform_subscription_invoices
       SET status = 'paid', provider = 'paymob', provider_reference = coalesce($2, provider_reference)
       WHERE id = $1
       RETURNING *`,
      [invoiceId, providerReference || `manual-paid-${Date.now()}`],
    );
    await client.query(
      `UPDATE tenants
       SET status = 'active',
           plan_code = $2,
           subscription_expires_at = greatest(coalesce(subscription_expires_at, now()), now()) + ($3::text || ' months')::interval
       WHERE id = $1`,
      [row.tenant_id, row.plan_code, row.duration_months],
    );
    await client.query("COMMIT");
    return updatedInvoice.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function migrate() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name_ar text NOT NULL,
      name_en text NOT NULL,
      slug text NOT NULL UNIQUE,
      country text NOT NULL,
      status text NOT NULL DEFAULT 'trial',
      plan_code text NOT NULL DEFAULT 'trial',
      subscription_expires_at timestamptz,
      checkout_provider text NOT NULL DEFAULT 'paymob',
      storefront_theme text NOT NULL DEFAULT 'ocean',
      brand_color text,
      logo_url text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      phone text,
      password_hash text NOT NULL,
      role text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS plans (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL UNIQUE,
      name text NOT NULL,
      duration_months int NOT NULL,
      price_cents int NOT NULL,
      is_active boolean NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
      name_ar text NOT NULL,
      name_en text NOT NULL,
      slug text NOT NULL,
      sort_order int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, slug)
    );

    CREATE TABLE IF NOT EXISTS products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
      title_ar text NOT NULL,
      title_en text NOT NULL,
      slug text NOT NULL,
      description text,
      price_cents int NOT NULL,
      compare_at_price_cents int,
      sku text,
      stock_quantity int NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'draft',
      image_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, slug)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name text NOT NULL,
      email text,
      phone text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'pending',
      payment_status text NOT NULL DEFAULT 'unpaid',
      total_cents int NOT NULL DEFAULT 0,
      customer_name text NOT NULL,
      customer_phone text NOT NULL,
      customer_email text,
      shipping_address text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id uuid REFERENCES products(id) ON DELETE SET NULL,
      title text NOT NULL,
      quantity int NOT NULL,
      unit_price_cents int NOT NULL,
      total_cents int NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenant_payment_credentials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider text NOT NULL,
      mode text NOT NULL DEFAULT 'test',
      public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
      encrypted_secret text NOT NULL DEFAULT '',
      is_enabled boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, provider)
    );

    CREATE TABLE IF NOT EXISTS platform_payment_credentials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider text NOT NULL UNIQUE,
      mode text NOT NULL DEFAULT 'test',
      public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
      encrypted_secret text NOT NULL DEFAULT '',
      is_enabled boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS platform_subscription_invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      plan_code text NOT NULL,
      amount_cents int NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      provider text NOT NULL DEFAULT 'easycash',
      provider_reference text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url text;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS media_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url text;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_percent int NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider text;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference text;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_url text;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_restored boolean NOT NULL DEFAULT false;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS checkout_provider text NOT NULL DEFAULT 'paymob';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS storefront_theme text NOT NULL DEFAULT 'ocean';
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_color text;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url text;
    CREATE SEQUENCE IF NOT EXISTS tenant_serial_seq START 1001;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS serial_code text;
  `);
  await pool.query(`
    UPDATE tenants t
    SET serial_code = 'ES-' || sub.n
    FROM (
      SELECT id, (1000 + ROW_NUMBER() OVER (ORDER BY created_at))::text AS n
      FROM tenants
      WHERE serial_code IS NULL
    ) sub
    WHERE t.id = sub.id
  `);
  await pool.query(`
    ALTER TABLE tenants ALTER COLUMN serial_code SET DEFAULT ('ES-' || nextval('tenant_serial_seq')::text);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_serial_code ON tenants (serial_code) WHERE serial_code IS NOT NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_android_builds (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'queued',
      github_run_id text,
      github_run_url text,
      artifact_url text,
      error_message text,
      requested_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_android_builds_tenant_created
    ON tenant_android_builds (tenant_id, created_at DESC);
    ALTER TABLE tenant_android_builds ADD COLUMN IF NOT EXISTS storefront_theme text;

    CREATE TABLE IF NOT EXISTS tenant_accounting_links (
      tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT false,
      cash_base_url text NOT NULL DEFAULT 'https://cash.easytecheg.net',
      cash_tenant_slug text,
      integration_secret text NOT NULL,
      sync_products_to_cash boolean NOT NULL DEFAULT true,
      sync_products_from_cash boolean NOT NULL DEFAULT true,
      sync_orders_to_cash boolean NOT NULL DEFAULT true,
      accounting_status text NOT NULL DEFAULT 'inactive',
      accounting_plan_code text,
      accounting_expires_at timestamptz,
      last_sync_at timestamptz,
      last_sync_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_accounting_links_cash_slug
      ON tenant_accounting_links (lower(cash_tenant_slug))
      WHERE cash_tenant_slug IS NOT NULL;

    CREATE TABLE IF NOT EXISTS integration_entity_maps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      entity_type text NOT NULL,
      shope_id text NOT NULL,
      cash_id text NOT NULL,
      code text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, entity_type, shope_id)
    );
    CREATE INDEX IF NOT EXISTS idx_integration_entity_maps_code
      ON integration_entity_maps (tenant_id, entity_type, code);
    CREATE INDEX IF NOT EXISTS idx_integration_entity_maps_cash
      ON integration_entity_maps (tenant_id, entity_type, cash_id);

    CREATE TABLE IF NOT EXISTS integration_sync_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      direction text NOT NULL,
      entity_type text NOT NULL,
      entity_id text,
      status text NOT NULL,
      message text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS accounting_invoice_synced boolean NOT NULL DEFAULT false;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS accounting_invoice_ref text;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS store_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_cents int;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee_cents int NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents int NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code text;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS governorate text;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text;

    CREATE TABLE IF NOT EXISTS coupons (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code text NOT NULL,
      discount_type text NOT NULL,
      discount_value int NOT NULL,
      min_order_cents int NOT NULL DEFAULT 0,
      max_uses int,
      used_count int NOT NULL DEFAULT 0,
      expires_at timestamptz,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, code)
    );

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token uuid;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number text;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_code text;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at timestamptz;

    CREATE TABLE IF NOT EXISTS product_reviews (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      customer_name text NOT NULL,
      customer_phone text,
      rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment text,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_product_reviews_product_status ON product_reviews (product_id, status);
  `);
  await pool.query(`
    UPDATE orders SET tracking_token = gen_random_uuid() WHERE tracking_token IS NULL
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    `INSERT INTO platform_settings (key, value) VALUES ('trial_days_default', '30')
     ON CONFLICT (key) DO NOTHING`,
  );
  await pool.query(`
    UPDATE tenants
    SET subscription_expires_at = created_at + (
      SELECT (coalesce(value, '30') || ' days')::interval FROM platform_settings WHERE key = 'trial_days_default'
    )
    WHERE subscription_expires_at IS NULL AND status = 'trial'
  `);

  const plans = [
    ["monthly", "Monthly", 1, 150000],
    ["quarterly", "Quarterly", 3, 405000],
    ["semi_annual", "Semi Annual", 6, 765000],
    ["annual", "Annual", 12, 1440000],
    ["two_years", "Two Years", 24, 2700000],
    ["three_years", "Three Years", 36, 3780000],
  ];
  for (const [code, name, duration, price] of plans) {
    await pool.query(
      `INSERT INTO plans (code, name, duration_months, price_cents)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING`,
      [code, name, duration, price],
    );
  }

  const ownerPasswordHash = await bcrypt.hash(env.platformOwnerPassword, 12);
  await pool.query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role)
     VALUES (NULL, 'Platform Owner', $1, $2, 'platform_owner')
     ON CONFLICT (email) DO NOTHING`,
    [env.platformOwnerEmail.toLowerCase(), ownerPasswordHash],
  );
  await expireOverdueSubscriptions();
  await migrateEncryptedSecrets();
}

const androidBuildCallbackBody = z.object({
  phase: z.enum(["registered", "completed"]),
  buildId: z.string().uuid(),
  githubRunId: z.string().max(64).optional().nullable(),
  githubRunUrl: z.string().max(800).optional().nullable(),
  status: z.enum(["succeeded", "failed"]).optional(),
  artifactUrl: z.string().max(4000).optional().nullable(),
  errorMessage: z.string().max(4000).optional().nullable(),
});

const STOREFRONT_THEME_CODES = ["ocean", "violet", "emerald", "amber", "rose", "slate"] as const;

function normalizeStorefrontThemeForBuild(raw: string | null | undefined): string {
  const t = String(raw || "ocean").toLowerCase();
  return (STOREFRONT_THEME_CODES as readonly string[]).includes(t) ? t : "ocean";
}

// --- Public media handling -------------------------------------------------
// Images/videos may be stored as large base64 data URIs in the DB. Embedding
// them inside list/store JSON makes responses huge and slow on mobile networks
// (connection closed while receiving data). Public endpoints instead return
// short relative media URLs, and the bytes are streamed lazily per item.

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isDataUri(value: unknown): value is string {
  return typeof value === "string" && /^data:/i.test(value);
}

/** Returns an http URL untouched, a relative media path for base64, else null. */
function toMediaRef(raw: unknown, mediaPath: string): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (isHttpUrl(raw)) return raw;
  if (isDataUri(raw)) return mediaPath;
  return null;
}

function publicStoreRow<T extends { id: string; logo_url?: string | null }>(row: T | undefined) {
  if (!row) return row;
  return { ...row, logo_url: toMediaRef(row.logo_url, `/api/media/tenant/${row.id}/logo`) };
}

function publicCategoryRow(row: any) {
  if (!row) return row;
  const out = { ...row };
  out.image_url = toMediaRef(row.image_url, `/api/media/category/${row.id}`);
  const sampleId = row.sample_product_id;
  out.sample_product_image = sampleId ? `/api/media/product/${sampleId}` : null;
  delete out.sample_product_id;
  return out;
}

function publicProductRow(row: any) {
  if (!row) return row;
  const media: unknown[] = Array.isArray(row.media_urls) ? row.media_urls : [];
  const primaryRaw =
    (typeof row.image_url === "string" && row.image_url) ||
    (typeof media[0] === "string" ? (media[0] as string) : "");
  const out = { ...row };
  out.image_url = primaryRaw ? toMediaRef(primaryRaw, `/api/media/product/${row.id}`) : null;
  out.media_urls = media
    .map((item, index) => toMediaRef(item, `/api/media/product/${row.id}/m/${index}`))
    .filter((value): value is string => Boolean(value));
  out.video_url = toMediaRef(row.video_url, `/api/media/product/${row.id}/video`);
  return out;
}

function sendMediaPayload(reply: import("fastify").FastifyReply, raw: string | null | undefined) {
  if (typeof raw !== "string" || raw.length === 0) {
    return reply.code(404).send({ message: "Not found" });
  }
  if (isHttpUrl(raw)) {
    return reply.redirect(raw);
  }
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/i.exec(raw);
  if (!match) return reply.code(404).send({ message: "Unsupported media" });
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const buffer = isBase64
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
  reply.header("Content-Type", mime);
  reply.header("Cache-Control", "public, max-age=86400");
  return reply.send(buffer);
}

async function ensureTenantSerialCode(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null;
  const existing = await pool.query(`SELECT serial_code FROM tenants WHERE id = $1`, [tenantId]);
  const current = existing.rows[0]?.serial_code as string | undefined;
  if (current) return current;
  const assigned = await pool.query(
    `UPDATE tenants
     SET serial_code = 'ES-' || nextval('tenant_serial_seq')::text
     WHERE id = $1 AND serial_code IS NULL
     RETURNING serial_code`,
    [tenantId],
  );
  return (assigned.rows[0]?.serial_code as string | undefined) ?? null;
}

async function dispatchTenantApkWorkflow(opts: {
  buildId: string;
  tenantId: string;
  tenantSlug: string;
  storefrontTheme: string;
}) {
  const token = env.githubActionsDispatchToken.trim();
  const repo = env.githubRepository.trim();
  if (!token || !repo) {
    throw httpError("GitHub workflow dispatch is not configured (GITHUB_ACTIONS_DISPATCH_TOKEN / GITHUB_REPOSITORY).", 503);
  }
  const parts = repo.split("/").map((s) => s.trim());
  const owner = parts[0];
  const name = parts.slice(1).join("/");
  if (!owner || !name) {
    throw httpError("GITHUB_REPOSITORY must look like owner/repo", 500);
  }
  const workflow = env.androidBuildWorkflowFile.replace(/^\.github\/workflows\//, "");
  const url = `https://api.github.com/repos/${owner}/${name}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      ref: env.githubDispatchRef,
      inputs: {
        build_id: opts.buildId,
        tenant_id: opts.tenantId,
        tenant_slug: opts.tenantSlug,
        storefront_theme: opts.storefrontTheme,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw httpError(`GitHub dispatch failed (${res.status}): ${text.slice(0, 500)}`, 502);
  }
}

app.get("/health", async () => {
  const db = await pool.query("SELECT 1 AS ok");
  return { ok: true, service: "easy-shope-api", db: db.rows[0].ok === 1 };
});

app.get("/api/health", async () => {
  const db = await pool.query("SELECT 1 AS ok");
  return { ok: true, service: "easy-shope-api", db: db.rows[0].ok === 1 };
});

app.post("/api/auth/register-merchant", async (request, reply) => {
  const body = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().min(6),
      password: z.string().min(8),
      storeNameAr: z.string().min(2),
      storeNameEn: z.string().min(2),
      country: z.string().min(2),
    })
    .parse(request.body);

  const slug = slugify(body.storeNameEn);
  if (!slug) return reply.code(400).send({ message: "Store English name must contain letters or numbers" });
  const existing = await pool.query(`SELECT 'email' AS field FROM users WHERE email = $1 UNION ALL SELECT 'store' AS field FROM tenants WHERE slug = $2`, [
    body.email.toLowerCase(),
    slug,
  ]);
  if (existing.rows.some((row) => row.field === "email")) return reply.code(409).send({ message: "هذا البريد مستخدم بالفعل. جرّب تسجيل الدخول أو استخدم بريدًا آخر." });
  if (existing.rows.some((row) => row.field === "store")) return reply.code(409).send({ message: "اسم المتجر الإنجليزي مستخدم بالفعل. غيّر الاسم الإنجليزي قليلًا." });
  const passwordHash = await bcrypt.hash(body.password, 12);
  const trialDays = await getTrialDaysDefault();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tenant = await client.query(
      `INSERT INTO tenants (name_ar, name_en, slug, country, status, plan_code, subscription_expires_at)
       VALUES ($1, $2, $3, $4, 'trial', 'trial', now() + ($5::text || ' days')::interval)
       RETURNING *`,
      [body.storeNameAr, body.storeNameEn, slug, body.country, String(trialDays)],
    );
    const user = await client.query(
      `INSERT INTO users (tenant_id, name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'merchant_owner')
       RETURNING id, tenant_id, name, email, phone, role, created_at`,
      [tenant.rows[0].id, body.name, body.email.toLowerCase(), body.phone, passwordHash],
    );
    await client.query("COMMIT");
    const token = signToken({ userId: user.rows[0].id, tenantId: tenant.rows[0].id, role: "merchant_owner" });
    return reply.code(201).send({ token, tenant: tenant.rows[0], user: user.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

app.post("/api/auth/login", async (request, reply) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
  const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [body.email.toLowerCase()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    return reply.code(401).send({ message: "Invalid email or password" });
  }
  if (user.status !== "active") {
    return reply.code(403).send({ message: "This account is disabled" });
  }
  const token = signToken({ userId: user.id, tenantId: user.tenant_id, role: user.role });
  const storeSerial = await ensureTenantSerialCode(user.tenant_id);
  return {
    token,
    user: { id: user.id, tenantId: user.tenant_id, name: user.name, email: user.email, role: user.role },
    storeSerial,
  };
});

app.get("/api/me", async (request) => {
  const user = requireAuth(request);
  const result = await pool.query(
    `SELECT users.id, users.name, users.email, users.role, users.status, users.permissions, users.tenant_id,
            tenants.name_en AS store_name, tenants.slug, tenants.serial_code AS store_serial
     FROM users LEFT JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.id = $1`,
    [user.userId],
  );
  return result.rows[0];
});

app.post("/api/auth/change-password", async (request, reply) => {
  const user = requireAuth(request);
  const body = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }).parse(request.body);
  const result = await pool.query(`SELECT id, password_hash FROM users WHERE id = $1`, [user.userId]);
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(body.currentPassword, row.password_hash))) {
    return reply.code(401).send({ message: "Current password is incorrect" });
  }
  const passwordHash = await bcrypt.hash(body.newPassword, 12);
  await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, user.userId]);
  return { ok: true };
});

app.get("/api/merchant/staff", async (request) => {
  const user = requireMerchantOwner(request);
  const result = await pool.query(
    `SELECT id, name, email, phone, role, status, permissions, created_at
     FROM users
     WHERE tenant_id = $1 AND role = 'merchant_staff'
     ORDER BY created_at DESC`,
    [user.tenantId],
  );
  return { staff: result.rows, availablePermissions: STAFF_PERMISSION_KEYS };
});

app.post("/api/merchant/staff", async (request, reply) => {
  const user = requireMerchantOwner(request);
  const body = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().optional(),
      password: z.string().min(8),
      permissions: z.array(z.string()).optional(),
    })
    .parse(request.body);
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [body.email.toLowerCase()]);
  if (existing.rows[0]) return reply.code(409).send({ message: "هذا البريد مستخدم بالفعل." });
  const passwordHash = await bcrypt.hash(body.password, 12);
  const permissions = sanitizeStaffPermissions(body.permissions);
  const result = await pool.query(
    `INSERT INTO users (tenant_id, name, email, phone, password_hash, role, status, permissions)
     VALUES ($1, $2, $3, $4, $5, 'merchant_staff', 'active', $6::jsonb)
     RETURNING id, name, email, phone, role, status, permissions, created_at`,
    [user.tenantId, body.name, body.email.toLowerCase(), body.phone ?? null, passwordHash, JSON.stringify(permissions)],
  );
  return reply.code(201).send({ staff: result.rows[0] });
});

app.patch("/api/merchant/staff/:staffId", async (request, reply) => {
  const user = requireMerchantOwner(request);
  const params = z.object({ staffId: z.string().uuid() }).parse(request.params);
  const body = z
    .object({
      name: z.string().min(2).optional(),
      phone: z.string().nullable().optional(),
      status: z.enum(["active", "disabled"]).optional(),
      permissions: z.array(z.string()).optional(),
    })
    .parse(request.body);
  const hasPermissions = Object.prototype.hasOwnProperty.call(body, "permissions");
  const permissions = hasPermissions ? sanitizeStaffPermissions(body.permissions) : [];
  const result = await pool.query(
    `UPDATE users
     SET name = coalesce($3, name),
         phone = CASE WHEN $4::boolean THEN $5::text ELSE phone END,
         status = coalesce($6, status),
         permissions = CASE WHEN $7::boolean THEN $8::jsonb ELSE permissions END
     WHERE id = $1 AND tenant_id = $2 AND role = 'merchant_staff'
     RETURNING id, name, email, phone, role, status, permissions, created_at`,
    [
      params.staffId,
      user.tenantId,
      body.name ?? null,
      Object.prototype.hasOwnProperty.call(body, "phone"),
      body.phone ?? null,
      body.status ?? null,
      hasPermissions,
      JSON.stringify(permissions),
    ],
  );
  if (!result.rows[0]) return reply.code(404).send({ message: "Staff user not found" });
  return { staff: result.rows[0] };
});

app.delete("/api/merchant/staff/:staffId", async (request, reply) => {
  const user = requireMerchantOwner(request);
  const params = z.object({ staffId: z.string().uuid() }).parse(request.params);
  const result = await pool.query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'merchant_staff' RETURNING id`, [params.staffId, user.tenantId]);
  if (!result.rows[0]) return reply.code(404).send({ message: "Staff user not found" });
  return reply.code(204).send();
});

app.get("/api/plans", async () => {
  const result = await pool.query(`SELECT * FROM plans WHERE is_active = true ORDER BY duration_months`);
  return { plans: result.rows };
});

app.post("/api/merchant/categories", async (request, reply) => {
  const user = requireMerchantUser(request);
  const body = z.object({ nameAr: z.string().min(1), nameEn: z.string().min(1), parentId: z.string().uuid().optional(), imageUrl: mediaUrlSchema.optional() }).parse(request.body);
  const categorySlug = slugify(body.nameEn);
  if (!categorySlug) throw httpError("Category English name must contain letters or numbers");
  const existing = await pool.query(`SELECT id FROM categories WHERE tenant_id = $1 AND slug = $2`, [user.tenantId, categorySlug]);
  if (existing.rows[0]) throw httpError("Category already exists with this English name", 409);
  const result = await pool.query(
    `INSERT INTO categories (tenant_id, parent_id, name_ar, name_en, slug, image_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [user.tenantId, body.parentId ?? null, body.nameAr, body.nameEn, categorySlug, body.imageUrl ?? null],
  );
  return reply.code(201).send({ category: result.rows[0] });
});

app.get("/api/merchant/categories", async (request) => {
  const user = requireMerchantUser(request);
  const result = await pool.query(`SELECT * FROM categories WHERE tenant_id = $1 ORDER BY sort_order, created_at DESC`, [user.tenantId]);
  return { categories: result.rows };
});

app.patch("/api/merchant/categories/:categoryId", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ categoryId: z.string().uuid() }).parse(request.params);
  const body = z
    .object({
      nameAr: z.string().min(1).optional(),
      nameEn: z.string().min(1).optional(),
      parentId: z.string().uuid().nullable().optional(),
      imageUrl: mediaUrlSchema.nullable().optional(),
      sortOrder: z.number().int().optional(),
    })
    .parse(request.body);
  const nextSlug = body.nameEn ? slugify(body.nameEn) : null;
  if (body.nameEn && !nextSlug) throw httpError("Category English name must contain letters or numbers");
  if (nextSlug) {
    const existing = await pool.query(`SELECT id FROM categories WHERE tenant_id = $1 AND slug = $2 AND id <> $3`, [
      user.tenantId,
      nextSlug,
      params.categoryId,
    ]);
    if (existing.rows[0]) throw httpError("Category already exists with this English name", 409);
  }
  const result = await pool.query(
    `UPDATE categories
     SET name_ar = coalesce($3, name_ar),
         name_en = coalesce($4, name_en),
         slug = coalesce($5, slug),
         parent_id = CASE WHEN $6 THEN $7::uuid ELSE parent_id END,
         image_url = CASE WHEN $8 THEN $9 ELSE image_url END,
         sort_order = coalesce($10, sort_order)
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [
      params.categoryId,
      user.tenantId,
      body.nameAr ?? null,
      body.nameEn ?? null,
      nextSlug,
      body.parentId !== undefined,
      body.parentId ?? null,
      body.imageUrl !== undefined,
      body.imageUrl ?? null,
      body.sortOrder ?? null,
    ],
  );
  if (!result.rows[0]) return reply.code(404).send({ message: "Category not found" });
  return { category: result.rows[0] };
});

app.delete("/api/merchant/categories/:categoryId", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ categoryId: z.string().uuid() }).parse(request.params);
  const linked = await pool.query(`SELECT count(*)::int AS c FROM products WHERE tenant_id = $1 AND category_id = $2`, [
    user.tenantId,
    params.categoryId,
  ]);
  if (linked.rows[0]?.c > 0) {
    return reply.code(409).send({ message: "لا يمكن حذف صنف مرتبط بمنتجات. انقل المنتجات أولاً." });
  }
  const result = await pool.query(`DELETE FROM categories WHERE id = $1 AND tenant_id = $2 RETURNING id`, [params.categoryId, user.tenantId]);
  if (!result.rows[0]) return reply.code(404).send({ message: "Category not found" });
  return { ok: true };
});

app.post("/api/merchant/products", async (request, reply) => {
  const user = requireMerchantUser(request);
  const body = z
    .object({
      categoryId: z.string().uuid().optional(),
      titleAr: z.string().min(1),
      titleEn: z.string().min(1),
      description: z.string().optional(),
      priceCents: z.number().int().nonnegative(),
      compareAtPriceCents: z.number().int().nonnegative().optional(),
      discountPercent: z.number().int().min(0).max(100).default(0),
      sku: z.string().optional(),
      stockQuantity: z.number().int().nonnegative().default(0),
      status: z.enum(["draft", "published"]).default("draft"),
      imageUrl: mediaUrlSchema.optional(),
      mediaUrls: z.array(mediaUrlSchema).max(8).default([]),
      videoUrl: mediaUrlSchema.optional(),
      variants: z.array(productVariantSchema).max(30).default([]),
    })
    .parse(request.body);
  if (body.categoryId) {
    const category = await pool.query(`SELECT id FROM categories WHERE id = $1 AND tenant_id = $2`, [body.categoryId, user.tenantId]);
    if (!category.rows[0]) throw httpError("Category not found for this store", 404);
  }
  const productSlug = slugify(body.titleEn);
  if (!productSlug) throw httpError("Product English name must contain letters or numbers");
  const existing = await pool.query(`SELECT id FROM products WHERE tenant_id = $1 AND slug = $2`, [user.tenantId, productSlug]);
  if (existing.rows[0]) throw httpError("Product already exists with this English name", 409);
  const result = await pool.query(
    `INSERT INTO products (tenant_id, category_id, title_ar, title_en, slug, description, price_cents, compare_at_price_cents, sku, stock_quantity, status, image_url, media_urls, video_url, discount_percent, variants)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16::jsonb)
     RETURNING *`,
    [
      user.tenantId,
      body.categoryId ?? null,
      body.titleAr,
      body.titleEn,
      productSlug,
      body.description ?? null,
      body.priceCents,
      body.compareAtPriceCents ?? null,
      body.sku ?? null,
      body.stockQuantity,
      body.status,
      body.imageUrl ?? null,
      JSON.stringify(body.mediaUrls.length ? body.mediaUrls : body.imageUrl ? [body.imageUrl] : []),
      body.videoUrl ?? null,
      body.discountPercent,
      JSON.stringify(body.variants.filter((variant) => variant.type || variant.color)),
    ],
  );
  const product = result.rows[0];
  void syncProductToAccounting(pool, user.tenantId, product).catch((err) => app.log.error({ err }, "accounting product sync failed"));
  return reply.code(201).send({ product });
});

app.get("/api/merchant/products", async (request) => {
  const user = requireMerchantUser(request);
  const result = await pool.query(`SELECT * FROM products WHERE tenant_id = $1 ORDER BY created_at DESC`, [user.tenantId]);
  return { products: result.rows };
});

app.patch("/api/merchant/products/:productId", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ productId: z.string().uuid() }).parse(request.params);
  const body = z
    .object({
      categoryId: z.string().uuid().nullable().optional(),
      titleAr: z.string().min(1).optional(),
      titleEn: z.string().min(1).optional(),
      description: z.string().optional(),
      priceCents: z.number().int().nonnegative().optional(),
      compareAtPriceCents: z.number().int().nonnegative().nullable().optional(),
      discountPercent: z.number().int().min(0).max(100).optional(),
      sku: z.string().nullable().optional(),
      stockQuantity: z.number().int().nonnegative().optional(),
      status: z.enum(["draft", "published"]).optional(),
      imageUrl: mediaUrlSchema.nullable().optional(),
      mediaUrls: z.array(mediaUrlSchema).max(8).optional(),
      videoUrl: mediaUrlSchema.nullable().optional(),
      variants: z.array(productVariantSchema).max(30).optional(),
    })
    .parse(request.body);
  if (body.categoryId) {
    const category = await pool.query(`SELECT id FROM categories WHERE id = $1 AND tenant_id = $2`, [body.categoryId, user.tenantId]);
    if (!category.rows[0]) throw httpError("Category not found for this store", 404);
  }
  const nextSlug = body.titleEn ? slugify(body.titleEn) : null;
  if (body.titleEn && !nextSlug) throw httpError("Product English name must contain letters or numbers");
  if (nextSlug) {
    const existing = await pool.query(`SELECT id FROM products WHERE tenant_id = $1 AND slug = $2 AND id <> $3`, [user.tenantId, nextSlug, params.productId]);
    if (existing.rows[0]) throw httpError("Product already exists with this English name", 409);
  }
  const result = await pool.query(
    `UPDATE products
     SET category_id = CASE WHEN $3::boolean THEN $4::uuid ELSE category_id END,
         title_ar = coalesce($5, title_ar),
         title_en = coalesce($6, title_en),
         slug = coalesce($7, slug),
         description = coalesce($8, description),
         price_cents = coalesce($9, price_cents),
         compare_at_price_cents = CASE WHEN $10::boolean THEN $11::int ELSE compare_at_price_cents END,
         sku = CASE WHEN $12::boolean THEN $13::text ELSE sku END,
         stock_quantity = coalesce($14, stock_quantity),
         status = coalesce($15, status),
         image_url = CASE WHEN $16::boolean THEN $17::text ELSE image_url END,
         media_urls = CASE WHEN $18::boolean THEN $19::jsonb ELSE media_urls END,
         video_url = CASE WHEN $20::boolean THEN $21::text ELSE video_url END,
         discount_percent = coalesce($22, discount_percent),
         variants = CASE WHEN $23::boolean THEN $24::jsonb ELSE variants END
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [
      params.productId,
      user.tenantId,
      Object.prototype.hasOwnProperty.call(body, "categoryId"),
      body.categoryId ?? null,
      body.titleAr ?? null,
      body.titleEn ?? null,
      nextSlug,
      body.description ?? null,
      body.priceCents ?? null,
      Object.prototype.hasOwnProperty.call(body, "compareAtPriceCents"),
      body.compareAtPriceCents ?? null,
      Object.prototype.hasOwnProperty.call(body, "sku"),
      body.sku ?? null,
      body.stockQuantity ?? null,
      body.status ?? null,
      Object.prototype.hasOwnProperty.call(body, "imageUrl"),
      body.imageUrl ?? null,
      Object.prototype.hasOwnProperty.call(body, "mediaUrls"),
      JSON.stringify(body.mediaUrls ?? []),
      Object.prototype.hasOwnProperty.call(body, "videoUrl"),
      body.videoUrl ?? null,
      body.discountPercent ?? null,
      Object.prototype.hasOwnProperty.call(body, "variants"),
      JSON.stringify((body.variants ?? []).filter((variant) => variant.type || variant.color)),
    ],
  );
  if (!result.rows[0]) return reply.code(404).send({ message: "Product not found" });
  void syncProductToAccounting(pool, user.tenantId, result.rows[0]).catch((err) => app.log.error({ err }, "accounting product sync failed"));
  return { product: result.rows[0] };
});

app.delete("/api/merchant/products/:productId", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ productId: z.string().uuid() }).parse(request.params);
  const result = await pool.query(`DELETE FROM products WHERE id = $1 AND tenant_id = $2 RETURNING id`, [params.productId, user.tenantId]);
  if (!result.rows[0]) return reply.code(404).send({ message: "Product not found" });
  return reply.code(204).send();
});

app.get("/api/merchant/orders", async (request) => {
  const user = requireMerchantUser(request);
  const result = await pool.query(`SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC`, [user.tenantId]);
  return { orders: result.rows };
});

app.get("/api/merchant/orders/:orderId", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ orderId: z.string().uuid() }).parse(request.params);
  const order = await pool.query(`SELECT * FROM orders WHERE id = $1 AND tenant_id = $2`, [params.orderId, user.tenantId]);
  if (!order.rows[0]) return reply.code(404).send({ message: "Order not found" });
  const items = await pool.query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [params.orderId]);
  return { order: order.rows[0], items: items.rows };
});

app.patch("/api/merchant/orders/:orderId/status", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ orderId: z.string().uuid() }).parse(request.params);
  const body = z
    .object({
      status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]),
      trackingNumber: z.string().max(128).optional(),
      carrierCode: z.enum(["manual", "bosta", "aramex"]).optional(),
    })
    .parse(request.body);
  const paymentStatus = body.status === "cancelled" ? "failed" : undefined;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tenantRes = await client.query(`SELECT slug FROM tenants WHERE id = $1`, [user.tenantId]);
    const tenantSlug = tenantRes.rows[0]?.slug as string | undefined;
    const result = await client.query(
      `UPDATE orders
       SET status = $3,
           payment_status = coalesce($4, payment_status),
           tracking_number = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE tracking_number END,
           carrier_code = CASE WHEN $6::text IS NOT NULL THEN $6 ELSE carrier_code END,
           shipped_at = CASE WHEN $3 = 'shipped' AND shipped_at IS NULL THEN now() ELSE shipped_at END
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        params.orderId,
        user.tenantId,
        body.status,
        paymentStatus ?? null,
        body.trackingNumber?.trim() || null,
        body.carrierCode ?? null,
      ],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ message: "Order not found" });
    }
    if (body.status === "cancelled") {
      await restoreOrderStock(client, params.orderId);
    }
    await client.query("COMMIT");
    const order = result.rows[0];
    const trackingUrl =
      order.tracking_token && tenantSlug
        ? absoluteUrl(request, `/store/${tenantSlug}/track/${order.tracking_token}`)
        : null;
    if (["shipped", "delivered", "confirmed", "processing", "cancelled"].includes(body.status)) {
      void notifyOrderStatusChange(pool, {
        tenantId: user.tenantId,
        orderId: order.id as string,
        status: body.status,
        customerName: order.customer_name as string,
        customerEmail: order.customer_email as string | null,
        customerPhone: order.customer_phone as string | null,
        trackingNumber: order.tracking_number as string | null,
        carrierCode: order.carrier_code as string | null,
        trackingUrl,
      }).catch((err) => app.log.error({ err }, "order status notification failed"));
    }
    return {
      order,
      trackingUrl,
      carrierTrackingUrl: carrierTrackingUrl(order.carrier_code as string | null, order.tracking_number as string | null),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

app.patch("/api/merchant/orders/:orderId/shipping", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ orderId: z.string().uuid() }).parse(request.params);
  const body = z
    .object({
      trackingNumber: z.string().max(128).optional(),
      carrierCode: z.enum(["manual", "bosta", "aramex"]).optional(),
      status: z.enum(["shipped", "delivered", "processing"]).optional(),
    })
    .parse(request.body);
  const result = await pool.query(
    `UPDATE orders
     SET tracking_number = coalesce($3, tracking_number),
         carrier_code = coalesce($4, carrier_code),
         status = coalesce($5, status),
         shipped_at = CASE WHEN coalesce($5, status) = 'shipped' AND shipped_at IS NULL THEN now() ELSE shipped_at END
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [params.orderId, user.tenantId, body.trackingNumber?.trim() || null, body.carrierCode ?? null, body.status ?? null],
  );
  if (!result.rows[0]) return reply.code(404).send({ message: "Order not found" });
  const order = result.rows[0];
  const tenantRes = await pool.query(`SELECT slug FROM tenants WHERE id = $1`, [user.tenantId]);
  const tenantSlug = tenantRes.rows[0]?.slug as string | undefined;
  const trackingUrl =
    order.tracking_token && tenantSlug ? absoluteUrl(request, `/store/${tenantSlug}/track/${order.tracking_token}`) : null;
  return {
    order,
    trackingUrl,
    carrierTrackingUrl: carrierTrackingUrl(order.carrier_code as string | null, order.tracking_number as string | null),
  };
});

app.get("/api/merchant/reviews", async (request) => {
  const user = requireMerchantUser(request);
  const query = z.object({ status: z.enum(["pending", "published", "rejected"]).optional() }).parse(request.query);
  const result = await pool.query(
    `SELECT reviews.*, products.title_ar, products.title_en
     FROM product_reviews reviews
     JOIN products ON products.id = reviews.product_id
     WHERE reviews.tenant_id = $1
       AND ($2::text IS NULL OR reviews.status = $2)
     ORDER BY reviews.created_at DESC
     LIMIT 100`,
    [user.tenantId, query.status ?? null],
  );
  return { reviews: result.rows };
});

app.patch("/api/merchant/reviews/:reviewId", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ reviewId: z.string().uuid() }).parse(request.params);
  const body = z.object({ status: z.enum(["pending", "published", "rejected"]) }).parse(request.body);
  const result = await pool.query(
    `UPDATE product_reviews SET status = $3 WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [params.reviewId, user.tenantId, body.status],
  );
  if (!result.rows[0]) return reply.code(404).send({ message: "Review not found" });
  return { review: result.rows[0] };
});

app.delete("/api/merchant/reviews/:reviewId", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ reviewId: z.string().uuid() }).parse(request.params);
  const result = await pool.query(`DELETE FROM product_reviews WHERE id = $1 AND tenant_id = $2 RETURNING id`, [
    params.reviewId,
    user.tenantId,
  ]);
  if (!result.rows[0]) return reply.code(404).send({ message: "Review not found" });
  return reply.code(204).send();
});

app.get("/api/merchant/payment-providers", async (request) => {
  const user = requireMerchantUser(request);
  const result = await pool.query(
    `SELECT id, provider, mode, public_config, is_enabled, updated_at
     FROM tenant_payment_credentials
     WHERE tenant_id = $1
     ORDER BY updated_at DESC`,
    [user.tenantId],
  );
  return { providers: result.rows };
});

app.post("/api/merchant/payment-providers/paymob", async (request) => {
  const user = requireMerchantUser(request);
  const body = z
    .object({
      mode: z.enum(["test", "live"]).default("test"),
      publicKey: z.string().min(8).optional(),
      secretKey: z.string().min(8).optional(),
      hmacSecret: z.string().optional(),
      cardIntegrationId: z.coerce.number().int().positive().optional(),
      walletIntegrationId: z.coerce.number().int().positive().optional(),
      currency: z.string().min(3).max(3).default("EGP"),
      enabled: z.boolean().default(false),
    })
    .parse(request.body);
  const existing = await pool.query(`SELECT * FROM tenant_payment_credentials WHERE tenant_id = $1 AND provider = 'paymob'`, [user.tenantId]);
  const existingRow = existing.rows[0];
  if ((!body.publicKey || !body.secretKey || !body.cardIntegrationId) && !existingRow) {
    const error = new Error("Public Key, Secret Key, and Card Integration ID are required for the first save");
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }
  const existingConfig = (existingRow?.public_config ?? {}) as Record<string, unknown>;
  const existingSecret = existingRow ? decodeSecret<{ secretKey: string; hmacSecret?: string }>(existingRow.encrypted_secret) : null;
  const publicConfig = {
    publicKey: body.publicKey ?? existingConfig.publicKey,
    publicKeyLast8: (body.publicKey ?? String(existingConfig.publicKey ?? "")).slice(-8),
    cardIntegrationId: body.cardIntegrationId ?? existingConfig.cardIntegrationId,
    walletIntegrationId: body.walletIntegrationId ?? existingConfig.walletIntegrationId ?? null,
    currency: body.currency.toUpperCase(),
  };
  assertPaymobPublicKey(publicConfig.publicKey);
  const result = await pool.query(
    `INSERT INTO tenant_payment_credentials (tenant_id, provider, mode, public_config, encrypted_secret, is_enabled)
     VALUES ($1, 'paymob', $2, $3, $4, $5)
     ON CONFLICT (tenant_id, provider)
     DO UPDATE SET mode = EXCLUDED.mode, public_config = EXCLUDED.public_config, encrypted_secret = EXCLUDED.encrypted_secret, is_enabled = EXCLUDED.is_enabled, updated_at = now()
     RETURNING id, tenant_id, provider, mode, public_config, is_enabled, updated_at`,
    [user.tenantId, body.mode, JSON.stringify(publicConfig), encodeSecret({ secretKey: body.secretKey ?? existingSecret?.secretKey, hmacSecret: body.hmacSecret ?? existingSecret?.hmacSecret ?? "" }), body.enabled],
  );
  return { credentials: result.rows[0] };
});

app.post("/api/merchant/payment-providers/paymob/test", async (request, reply) => {
  const user = requireMerchantUser(request);
  const result = await pool.query(`SELECT * FROM tenant_payment_credentials WHERE tenant_id = $1 AND provider = 'paymob'`, [user.tenantId]);
  const credentials = result.rows[0];
  if (!credentials) return reply.code(404).send({ message: "Paymob settings not found" });
  const secret = decodeSecret<{ secretKey: string }>(credentials.encrypted_secret);
  const response = await fetch("https://accept.paymob.com/v1/intention/", {
    method: "POST",
    headers: { Authorization: `Token ${secret.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: 100,
      currency: credentials.public_config.currency || "EGP",
      payment_methods: [Number(credentials.public_config.cardIntegrationId)],
      items: [{ name: "Connection test", amount: 100, description: "Easy Shope Paymob test", quantity: 1 }],
      billing_data: {
        first_name: "Easy",
        last_name: "Shope",
        phone_number: "01000000000",
        email: "test@example.com",
        country: "EG",
        city: "Cairo",
        street: "NA",
        building: "NA",
        apartment: "NA",
        floor: "NA",
      },
      special_reference: `test-${user.tenantId}-${Date.now()}`,
      expiration: 600,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return reply.code(400).send({ ok: false, message: data.message || "Paymob connection failed", details: data });
  return { ok: true, provider: "paymob", intentionId: data.id, hasClientSecret: Boolean(data.client_secret) };
});

app.get("/api/merchant/dashboard", async (request) => {
  const user = requireMerchantUser(request);
  const [tenant, products, categories, orders, revenue, latestOrders] = await Promise.all([
    pool.query(`SELECT * FROM tenants WHERE id = $1`, [user.tenantId]),
    pool.query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE status = 'published')::int AS published,
         coalesce(sum(stock_quantity), 0)::int AS stock
       FROM products WHERE tenant_id = $1`,
      [user.tenantId],
    ),
    pool.query(`SELECT count(*)::int AS total FROM categories WHERE tenant_id = $1`, [user.tenantId]),
    pool.query(`SELECT status, count(*)::int AS count FROM orders WHERE tenant_id = $1 GROUP BY status`, [user.tenantId]),
    pool.query(`SELECT count(*)::int AS count, coalesce(sum(total_cents), 0)::int AS total_cents FROM orders WHERE tenant_id = $1`, [user.tenantId]),
    pool.query(`SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 6`, [user.tenantId]),
  ]);
  return {
    tenant: tenant.rows[0],
    products: products.rows[0],
    categories: categories.rows[0],
    ordersByStatus: orders.rows,
    revenue: revenue.rows[0],
    latestOrders: latestOrders.rows,
  };
});

app.get("/api/merchant/store", async (request) => {
  const user = requireMerchantUser(request);
  const result = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [user.tenantId]);
  return { store: result.rows[0] };
});

app.get("/api/merchant/accounting", async (request) => {
  const user = requireMerchantUser(request);
  const [link, logs, plans, ownerEmail] = await Promise.all([
    getAccountingLink(pool, user.tenantId),
    pool.query(`SELECT * FROM integration_sync_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 40`, [user.tenantId]),
    pool.query(`SELECT * FROM plans ORDER BY duration_months ASC`),
    getMerchantOwnerEmail(pool, user.tenantId),
  ]);
  return {
    link,
    syncLog: logs.rows,
    plans: plans.rows,
    integrationConfigured: Boolean(env.shopeIntegrationSecret),
    merchantOwnerEmail: ownerEmail,
  };
});

app.post("/api/merchant/accounting/discover", async (request, reply) => {
  const user = requireMerchantUser(request);
  const body = z.object({ cashBaseUrl: z.string().url().optional() }).parse(request.body ?? {});
  const ownerEmail = await getMerchantOwnerEmail(pool, user.tenantId);
  if (!ownerEmail) return reply.code(400).send({ message: "لم يُعثر على إيميل صاحب المتجر" });
  const cashBaseUrl = body.cashBaseUrl ?? (await getAccountingLink(pool, user.tenantId))?.cash_base_url ?? "https://cash.easytecheg.net";
  try {
    const matches = await discoverCashTenantsByEmail(cashBaseUrl, ownerEmail);
    return { email: ownerEmail, cashBaseUrl, matches };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return reply.code(502).send({ message });
  }
});

app.post("/api/merchant/accounting/auto-link", async (request, reply) => {
  const user = requireMerchantOwner(request);
  const body = z
    .object({
      cashBaseUrl: z.string().url().optional(),
      cashTenantSlug: z.string().min(1).max(80).optional(),
      enable: z.boolean().default(true),
    })
    .parse(request.body ?? {});
  const ownerEmail = await getMerchantOwnerEmail(pool, user.tenantId);
  if (!ownerEmail) return reply.code(400).send({ message: "لم يُعثر على إيميل صاحب المتجر" });
  const existing = await getAccountingLink(pool, user.tenantId);
  const cashBaseUrl = body.cashBaseUrl ?? existing?.cash_base_url ?? "https://cash.easytecheg.net";

  let slug = body.cashTenantSlug?.trim().toLowerCase();
  if (!slug) {
    const matches = await discoverCashTenantsByEmail(cashBaseUrl, ownerEmail);
    if (!matches.length) {
      return reply.code(404).send({
        message: `لا توجد شركة Easy Cash مسجّلة بإيميل ${ownerEmail}. أنشئ حساباً في Easy Cash بنفس الإيميل ثم حاول مرة أخرى.`,
        email: ownerEmail,
        matches: [],
      });
    }
    if (matches.length > 1) {
      return reply.code(409).send({
        message: "يوجد أكثر من شركة Easy Cash بنفس الإيميل — اختر slug الشركة يدوياً.",
        email: ownerEmail,
        matches,
      });
    }
    slug = matches[0].slug;
  }

  const link = await upsertAccountingLink(pool, user.tenantId, {
    enabled: body.enable,
    cash_tenant_slug: slug,
    cash_base_url: cashBaseUrl,
    accounting_status: body.enable ? "active" : "inactive",
  });
  return { link, matchedByEmail: !body.cashTenantSlug, email: ownerEmail };
});

app.put("/api/merchant/accounting", async (request) => {
  const user = requireMerchantUser(request);
  const body = z
    .object({
      enabled: z.boolean().optional(),
      cashTenantSlug: z.string().min(1).max(80).optional(),
      cashBaseUrl: z.string().url().optional(),
      syncProductsToCash: z.boolean().optional(),
      syncProductsFromCash: z.boolean().optional(),
      syncOrdersToCash: z.boolean().optional(),
    })
    .parse(request.body);
  const link = await upsertAccountingLink(pool, user.tenantId, {
    enabled: body.enabled,
    cash_tenant_slug: body.cashTenantSlug?.trim().toLowerCase(),
    cash_base_url: body.cashBaseUrl,
    sync_products_to_cash: body.syncProductsToCash,
    sync_products_from_cash: body.syncProductsFromCash,
    sync_orders_to_cash: body.syncOrdersToCash,
    accounting_status: body.enabled === true ? "active" : body.enabled === false ? "inactive" : undefined,
  });
  return { link };
});

app.post("/api/merchant/accounting/test", async (request, reply) => {
  const user = requireMerchantUser(request);
  const link = await getAccountingLink(pool, user.tenantId);
  if (!link?.cash_tenant_slug) return reply.code(400).send({ message: "أدخل slug شركة Easy Cash أولاً" });
  const base = link.cash_base_url.replace(/\/$/, "");
  const secret = env.shopeIntegrationSecret || link.integration_secret;
  if (!secret) return reply.code(503).send({ message: "SHOPE_INTEGRATION_SECRET غير مضبوط على الخادم" });
  const response = await fetch(`${base}/api/integration/shope/health`, {
    headers: { "X-Shope-Integration-Secret": secret, "X-Tenant-Slug": link.cash_tenant_slug },
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) return reply.code(502).send({ message: String(data.error || "فشل الاتصال بـ Easy Cash") });
  return { ok: true, ...data };
});

app.post("/api/integration/accounting/item-sync", async (request, reply) => {
  const secret = String(request.headers["x-shope-integration-secret"] ?? "");
  const cashSlug = String(request.headers["x-cash-tenant-slug"] ?? "")
    .trim()
    .toLowerCase();
  if (!env.shopeIntegrationSecret || secret !== env.shopeIntegrationSecret) {
    return reply.code(401).send({ message: "Invalid integration secret" });
  }
  if (!cashSlug) return reply.code(400).send({ message: "X-Cash-Tenant-Slug required" });
  const tenantRes = await pool.query(
    `SELECT tenant_id FROM tenant_accounting_links
     WHERE lower(cash_tenant_slug) = $1 AND enabled = true AND sync_products_from_cash = true
     LIMIT 1`,
    [cashSlug],
  );
  if (!tenantRes.rows[0]) return reply.code(404).send({ message: "No linked Shope store for this Cash tenant" });
  const body = z
    .object({
      code: z.string().min(1),
      name: z.string().min(1),
      salePrice: z.string().optional(),
      currentStock: z.string().optional(),
      barcode: z.string().optional(),
      description: z.string().optional(),
      cashItemId: z.union([z.number(), z.string()]).optional(),
    })
    .parse(request.body);
  const result = await syncItemFromAccountingToShope(pool, tenantRes.rows[0].tenant_id as string, body);
  return { ok: true, ...result };
});

app.patch("/api/merchant/store", async (request) => {
  const user = requireMerchantUser(request);
  const body = z
    .object({
      nameAr: z.string().min(2).optional(),
      nameEn: z.string().min(2).optional(),
      country: z.string().min(2).optional(),
      checkoutProvider: z.enum(["paymob", "easycash"]).optional(),
      storefrontTheme: z.enum(["ocean", "violet", "emerald", "amber", "rose", "slate"]).optional(),
      brandColor: z.string().min(3).max(32).optional(),
      logoUrl: z.string().min(1).max(2_000_000).optional(),
      storeSettings: z
        .object({
          paymentMethods: z
            .object({
              paymob: z.boolean().optional(),
              cod: z.boolean().optional(),
              fawry: z.boolean().optional(),
              easycash: z.boolean().optional(),
            })
            .optional(),
          codFeeCents: z.number().int().nonnegative().optional(),
          freeShippingMinCents: z.number().int().nonnegative().optional(),
          shippingRates: z
            .array(
              z.object({
                id: z.string().min(1),
                nameAr: z.string().min(1),
                nameEn: z.string().min(1),
                feeCents: z.number().int().nonnegative(),
              }),
            )
            .optional(),
          metaPixelId: z.string().max(64).optional(),
          gtmId: z.string().max(64).optional(),
          customDomain: z.string().max(253).optional(),
          merchantWhatsAppPhone: z.string().max(32).optional(),
          notifyWhatsAppOnNewOrder: z.boolean().optional(),
          notifyEmailOnStatusChange: z.boolean().optional(),
          defaultCarrier: z.enum(["manual", "bosta", "aramex"]).optional(),
          reviewsEnabled: z.boolean().optional(),
        })
        .optional(),
    })
    .parse(request.body);
  let mergedSettings: string | null = null;
  if (body.storeSettings) {
    const current = await pool.query(`SELECT store_settings FROM tenants WHERE id = $1`, [user.tenantId]);
    const parsed = parseStoreSettings(current.rows[0]?.store_settings);
    const patch = body.storeSettings;
    const next = parseStoreSettings({
      ...parsed,
      ...patch,
      paymentMethods: { ...parsed.paymentMethods, ...(patch.paymentMethods || {}) },
      shippingRates: patch.shippingRates ?? parsed.shippingRates,
    });
    mergedSettings = JSON.stringify(next);
  }
  const result = await pool.query(
    `UPDATE tenants
     SET name_ar = coalesce($2, name_ar),
         name_en = coalesce($3, name_en),
         country = coalesce($4, country),
         checkout_provider = coalesce($5, checkout_provider),
         storefront_theme = coalesce($6, storefront_theme),
         brand_color = coalesce($7, brand_color),
         logo_url = coalesce($8, logo_url),
         store_settings = coalesce($9::jsonb, store_settings)
     WHERE id = $1
     RETURNING *`,
    [
      user.tenantId,
      body.nameAr ?? null,
      body.nameEn ?? null,
      body.country ?? null,
      body.checkoutProvider ?? null,
      body.storefrontTheme ?? null,
      body.brandColor ?? null,
      body.logoUrl ?? null,
      mergedSettings,
    ],
  );
  return { store: result.rows[0] };
});

app.get("/api/merchant/coupons", async (request) => {
  const user = requireMerchantUser(request);
  const result = await pool.query(`SELECT * FROM coupons WHERE tenant_id = $1 ORDER BY created_at DESC`, [user.tenantId]);
  return { coupons: result.rows };
});

app.post("/api/merchant/coupons", async (request, reply) => {
  const user = requireMerchantUser(request);
  const body = z
    .object({
      code: z.string().min(2).max(32),
      discountType: z.enum(["percent", "fixed"]),
      discountValue: z.number().int().positive(),
      minOrderCents: z.number().int().nonnegative().default(0),
      maxUses: z.number().int().positive().nullable().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      isActive: z.boolean().default(true),
    })
    .parse(request.body);
  const code = body.code.trim().toUpperCase();
  const result = await pool.query(
    `INSERT INTO coupons (tenant_id, code, discount_type, discount_value, min_order_cents, max_uses, expires_at, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      user.tenantId,
      code,
      body.discountType,
      body.discountType === "percent" ? Math.min(100, body.discountValue) : body.discountValue,
      body.minOrderCents,
      body.maxUses ?? null,
      body.expiresAt ?? null,
      body.isActive,
    ],
  );
  return reply.code(201).send({ coupon: result.rows[0] });
});

app.patch("/api/merchant/coupons/:couponId", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ couponId: z.string().uuid() }).parse(request.params);
  const body = z
    .object({
      discountType: z.enum(["percent", "fixed"]).optional(),
      discountValue: z.number().int().positive().optional(),
      minOrderCents: z.number().int().nonnegative().optional(),
      maxUses: z.number().int().positive().nullable().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .parse(request.body);
  const result = await pool.query(
    `UPDATE coupons
     SET discount_type = coalesce($3, discount_type),
         discount_value = coalesce($4, discount_value),
         min_order_cents = coalesce($5, min_order_cents),
         max_uses = CASE WHEN $6::text IS NULL THEN max_uses ELSE $6::int END,
         expires_at = CASE WHEN $7::text IS NULL THEN expires_at ELSE $7::timestamptz END,
         is_active = coalesce($8, is_active)
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [
      params.couponId,
      user.tenantId,
      body.discountType ?? null,
      body.discountValue ?? null,
      body.minOrderCents ?? null,
      body.maxUses === undefined ? null : body.maxUses,
      body.expiresAt === undefined ? null : body.expiresAt,
      body.isActive ?? null,
    ],
  );
  if (!result.rows[0]) return reply.code(404).send({ message: "Coupon not found" });
  return { coupon: result.rows[0] };
});

app.delete("/api/merchant/coupons/:couponId", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ couponId: z.string().uuid() }).parse(request.params);
  const result = await pool.query(`DELETE FROM coupons WHERE id = $1 AND tenant_id = $2 RETURNING id`, [params.couponId, user.tenantId]);
  if (!result.rows[0]) return reply.code(404).send({ message: "Coupon not found" });
  return { ok: true };
});

app.get("/api/merchant/android-builds", async (request) => {
  const user = requireMerchantUser(request);
  const result = await pool.query(
    `SELECT id, status, storefront_theme, github_run_id, github_run_url, artifact_url, error_message, created_at, updated_at
     FROM tenant_android_builds
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT 40`,
    [user.tenantId],
  );
  const dispatchReady = Boolean(env.githubActionsDispatchToken.trim() && env.githubRepository.trim());
  const callbackReady = Boolean(env.androidBuildCallbackSecret.trim());
  return {
    builds: result.rows,
    integration: { dispatchReady, callbackReady },
  };
});

app.post("/api/merchant/android-build", async (request, reply) => {
  const user = requireMerchantUser(request);
  const body = z
    .object({
      storefrontTheme: z.enum(STOREFRONT_THEME_CODES).optional(),
    })
    .parse(request.body ?? {});
  if (user.role !== "merchant_owner") {
    return reply.code(403).send({ message: "هذا الإجراء متاح لصاحب المتجر فقط." });
  }
  if (!env.githubActionsDispatchToken.trim() || !env.githubRepository.trim()) {
    return reply.code(503).send({
      code: "android_build_not_configured",
      message: "بناء تطبيق أندرويد غير مفعّل على خادم الـ API.",
      hint: "أضِف في ملف .env لـ docker-compose على خادم النشر: GITHUB_ACTIONS_DISPATCH_TOKEN (PAT مع صلاحية workflow) و GITHUB_REPOSITORY (مثل Owner/easy.shope). أسرار مستودع GitHub للـ workflow (EASY_SHOPE_API_URL، MOBILE_APP_REPOSITORY، …) تُضبط منفصلة في إعدادات المستودع على GitHub.",
    });
  }
  if (!env.androidBuildCallbackSecret.trim()) {
    return reply.code(503).send({
      code: "android_build_not_configured",
      message: "سرّ استدعاء بناء الأندرويد غير مضبوط على خادم الـ API.",
      hint: "عيّن ANDROID_BUILD_CALLBACK_SECRET في .env للخادم، ونفس القيمة في أسرار GitHub (ANDROID_BUILD_CALLBACK_SECRET) لمسار build-tenant-apk.yml.",
    });
  }
  const running = await pool.query(
    `SELECT id FROM tenant_android_builds WHERE tenant_id = $1 AND status IN ('queued', 'running') LIMIT 1`,
    [user.tenantId],
  );
  if (running.rows[0]) {
    return reply.code(409).send({ message: "يوجد بناء جارٍ أو في قائمة الانتظار. انتظر اكتماله قبل طلب بناء جديد." });
  }
  const tenant = await pool.query(`SELECT slug, storefront_theme FROM tenants WHERE id = $1`, [user.tenantId]);
  const slugRow = tenant.rows[0];
  if (!slugRow) return reply.code(404).send({ message: "المتجر غير موجود" });
  const tenantId = user.tenantId;
  const tenantSlug = slugRow.slug;
  let storefrontTheme = normalizeStorefrontThemeForBuild(slugRow.storefront_theme);
  if (body.storefrontTheme) {
    storefrontTheme = normalizeStorefrontThemeForBuild(body.storefrontTheme);
    await pool.query(`UPDATE tenants SET storefront_theme = $2 WHERE id = $1`, [tenantId, storefrontTheme]);
  }
  if (!tenantId) return reply.code(403).send({ message: "Tenant required" });
  if (!tenantSlug) return reply.code(500).send({ message: "المتجر بدون slug" });

  const insert = await pool.query(
    `INSERT INTO tenant_android_builds (tenant_id, status, storefront_theme, requested_by_user_id)
     VALUES ($1, 'queued', $2, $3)
     RETURNING id`,
    [tenantId, storefrontTheme, user.userId],
  );
  const buildId = insert.rows[0].id as string;
  try {
    await dispatchTenantApkWorkflow({ buildId, tenantId, tenantSlug, storefrontTheme });
  } catch (error) {
    const message = (error as Error).message.slice(0, 2000);
    await pool.query(
      `UPDATE tenant_android_builds SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1`,
      [buildId, message],
    );
    return reply.code((error as Error & { statusCode?: number }).statusCode || 502).send({ message });
  }
  return { build: { id: buildId, status: "queued" } };
});

app.post("/api/internal/android-build/callback", async (request, reply) => {
  const header = request.headers["x-easy-shope-build-secret"];
  const secretHeader = Array.isArray(header) ? header[0] : header;
  if (!env.androidBuildCallbackSecret.trim() || secretHeader !== env.androidBuildCallbackSecret) {
    return reply.code(401).send({ message: "Unauthorized" });
  }
  const body = androidBuildCallbackBody.parse(request.body);
  const exists = await pool.query(`SELECT id FROM tenant_android_builds WHERE id = $1`, [body.buildId]);
  if (!exists.rows[0]) return reply.code(404).send({ message: "Unknown build" });

  if (body.phase === "registered") {
    await pool.query(
      `UPDATE tenant_android_builds
       SET status = 'running', github_run_id = coalesce($2, github_run_id), github_run_url = coalesce($3, github_run_url), updated_at = now()
       WHERE id = $1`,
      [body.buildId, body.githubRunId ?? null, body.githubRunUrl ?? null],
    );
    return { ok: true };
  }
  if (!body.status) {
    return reply.code(400).send({ message: "status is required when phase is completed" });
  }
  const finalStatus = body.status === "succeeded" ? "succeeded" : "failed";
  await pool.query(
    `UPDATE tenant_android_builds
     SET status = $2, artifact_url = $3, error_message = $4, updated_at = now()
     WHERE id = $1`,
    [body.buildId, finalStatus, body.artifactUrl ?? null, body.errorMessage ?? null],
  );
  return { ok: true };
});

app.get("/api/store/:tenantSlug", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string() }).parse(request.params);
  await expireOverdueSubscriptions();
  const [tenant, categories, products] = await Promise.all([
    pool.query(
      `SELECT id, name_ar, name_en, slug, country, status, plan_code, storefront_theme, brand_color, logo_url, serial_code, store_settings
       FROM tenants WHERE slug = $1 AND status NOT IN ('suspended', 'expired')`,
      [
      params.tenantSlug,
      ],
    ),
    pool.query(
      `SELECT categories.id, categories.name_ar, categories.name_en, categories.slug, categories.image_url,
              count(products.id)::int AS products_count,
              (SELECT p.id FROM products p
               WHERE p.category_id = categories.id AND p.status = 'published'
                 AND (p.image_url IS NOT NULL OR jsonb_array_length(p.media_urls) > 0)
               LIMIT 1) AS sample_product_id
       FROM categories
       JOIN tenants ON tenants.id = categories.tenant_id
       LEFT JOIN products ON products.category_id = categories.id AND products.status = 'published'
       WHERE tenants.slug = $1 AND tenants.status NOT IN ('suspended', 'expired')
       GROUP BY categories.id
       ORDER BY categories.sort_order, categories.created_at DESC`,
      [params.tenantSlug],
    ),
    pool.query(
      `SELECT products.*
       FROM products JOIN tenants ON tenants.id = products.tenant_id
       WHERE tenants.slug = $1 AND tenants.status NOT IN ('suspended', 'expired') AND products.status = 'published'
       ORDER BY products.created_at DESC
       LIMIT 12`,
      [params.tenantSlug],
    ),
  ]);
  if (!tenant.rows[0]) return reply.code(404).send({ message: "Store not found or subscription inactive" });
  const settings = parseStoreSettings(tenant.rows[0].store_settings);
  return {
    store: publicStoreRow(tenant.rows[0]),
    checkout: publicCheckoutConfig(settings),
    categories: categories.rows.map(publicCategoryRow),
    featuredProducts: products.rows.map(publicProductRow),
  };
});

app.get("/api/media/tenant/:id/logo", async (request, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  const result = await pool.query(`SELECT logo_url FROM tenants WHERE id = $1`, [id]);
  return sendMediaPayload(reply, result.rows[0]?.logo_url);
});

app.get("/api/media/category/:id", async (request, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  const result = await pool.query(`SELECT image_url FROM categories WHERE id = $1`, [id]);
  return sendMediaPayload(reply, result.rows[0]?.image_url);
});

app.get("/api/media/product/:id", async (request, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  const result = await pool.query(`SELECT image_url, media_urls FROM products WHERE id = $1`, [id]);
  const row = result.rows[0];
  const media = Array.isArray(row?.media_urls) ? row.media_urls : [];
  const raw =
    (typeof row?.image_url === "string" && row.image_url) ||
    (typeof media[0] === "string" ? media[0] : null);
  return sendMediaPayload(reply, raw);
});

app.get("/api/media/product/:id/m/:index", async (request, reply) => {
  const { id, index } = z
    .object({ id: z.string().uuid(), index: z.coerce.number().int().min(0).max(50) })
    .parse(request.params);
  const result = await pool.query(`SELECT media_urls FROM products WHERE id = $1`, [id]);
  const media = Array.isArray(result.rows[0]?.media_urls) ? result.rows[0].media_urls : [];
  return sendMediaPayload(reply, media[index]);
});

app.get("/api/media/product/:id/video", async (request, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  const result = await pool.query(`SELECT video_url FROM products WHERE id = $1`, [id]);
  return sendMediaPayload(reply, result.rows[0]?.video_url);
});

app.get("/api/store/:tenantSlug/products", async (request) => {
  const params = z.object({ tenantSlug: z.string() }).parse(request.params);
  const query = z.object({ q: z.string().optional(), category: z.string().optional() }).parse(request.query);
  const result = await pool.query(
    `SELECT products.*
     FROM products JOIN tenants ON tenants.id = products.tenant_id
     LEFT JOIN categories ON categories.id = products.category_id
     WHERE tenants.slug = $1
       AND tenants.status NOT IN ('suspended', 'expired')
       AND products.status = 'published'
       AND ($2::text IS NULL OR products.title_ar ILIKE '%' || $2 || '%' OR products.title_en ILIKE '%' || $2 || '%' OR products.description ILIKE '%' || $2 || '%')
       AND ($3::text IS NULL OR categories.slug = $3)
     ORDER BY products.created_at DESC`,
    [params.tenantSlug, query.q ?? null, query.category ?? null],
  );
  return { products: result.rows.map(publicProductRow) };
});

app.get("/api/store/:tenantSlug/products/:productSlug", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string(), productSlug: z.string() }).parse(request.params);
  const result = await pool.query(
    `SELECT products.*, categories.name_ar AS category_name_ar, categories.name_en AS category_name_en
     FROM products
     JOIN tenants ON tenants.id = products.tenant_id
     LEFT JOIN categories ON categories.id = products.category_id
     WHERE tenants.slug = $1
       AND tenants.status NOT IN ('suspended', 'expired')
       AND products.slug = $2
       AND products.status = 'published'`,
    [params.tenantSlug, params.productSlug],
  );
  if (!result.rows[0]) return reply.code(404).send({ message: "Product not found" });
  return { product: publicProductRow(result.rows[0]) };
});

app.post("/api/store/:tenantSlug/customers/register", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string() }).parse(request.params);
  const body = z.object({ name: z.string().min(2), email: z.string().email(), phone: z.string().min(6), password: z.string().min(8) }).parse(request.body);
  const tenant = await pool.query(`SELECT id, slug FROM tenants WHERE slug = $1 AND status NOT IN ('suspended', 'expired')`, [params.tenantSlug]);
  if (!tenant.rows[0]) return reply.code(404).send({ message: "Store not found" });
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [body.email.toLowerCase()]);
  if (existing.rows[0]) return reply.code(409).send({ message: "هذا البريد مستخدم بالفعل. جرّب تسجيل الدخول." });
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await pool.query(
    `INSERT INTO users (tenant_id, name, email, phone, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5, 'customer', 'active')
     RETURNING id, tenant_id, name, email, phone, role, status`,
    [tenant.rows[0].id, body.name, body.email.toLowerCase(), body.phone, passwordHash],
  );
  await pool.query(
    `INSERT INTO customers (tenant_id, name, email, phone)
     VALUES ($1, $2, $3, $4)`,
    [tenant.rows[0].id, body.name, body.email.toLowerCase(), body.phone],
  );
  const token = signToken({ userId: user.rows[0].id, tenantId: tenant.rows[0].id, role: "customer" });
  return reply.code(201).send({ token, user: user.rows[0], tenant: tenant.rows[0] });
});

app.get("/api/customer/orders", async (request) => {
  const user = requireTenantUser(request);
  if (user.role !== "customer") throw httpError("Customer account required", 403);
  const me = await pool.query(`SELECT email, phone FROM users WHERE id = $1`, [user.userId]);
  const tenantRes = await pool.query(`SELECT slug FROM tenants WHERE id = $1`, [user.tenantId]);
  const tenantSlug = tenantRes.rows[0]?.slug as string | undefined;
  const result = await pool.query(
    `SELECT id, status, payment_status, total_cents, created_at, tracking_token, tracking_number, carrier_code, shipped_at
     FROM orders
     WHERE tenant_id = $1 AND (customer_email = $2 OR customer_phone = $3)
     ORDER BY created_at DESC
     LIMIT 25`,
    [user.tenantId, me.rows[0]?.email ?? null, me.rows[0]?.phone ?? null],
  );
  return {
    orders: result.rows.map((order) => ({
      ...order,
      trackingUrl: order.tracking_token && tenantSlug ? `/store/${tenantSlug}/track/${order.tracking_token}` : null,
      carrierTrackingUrl: carrierTrackingUrl(order.carrier_code as string | null, order.tracking_number as string | null),
    })),
  };
});

const storeOrderDeps = {
  get pool() {
    return pool;
  },
  expireOverdueSubscriptions,
  httpError,
  splitName,
  assertPaymobPublicKey,
  paymobCheckoutUrl,
  decodeSecret,
  absoluteUrl,
  log: app.log,
};

app.post("/api/store/:tenantSlug/checkout/quote", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string() }).parse(request.params);
  return handleStoreCheckoutQuote(storeOrderDeps, request, reply, params.tenantSlug, request.body);
});

app.post("/api/store/:tenantSlug/orders", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string() }).parse(request.params);
  return handleCreateStoreOrder(storeOrderDeps, request, reply, params.tenantSlug, request.body);
});

function publicTrackPayload(
  order: Record<string, unknown>,
  items: Array<Record<string, unknown>>,
  store: Record<string, unknown>,
  absUrl: (path: string) => string,
) {
  const slug = String(store.slug || "");
  const trackingUrl = order.tracking_token ? absUrl(`/store/${slug}/track/${order.tracking_token}`) : null;
  return {
    order: {
      id: order.id,
      status: order.status,
      paymentStatus: order.payment_status,
      totalCents: order.total_cents,
      createdAt: order.created_at,
      trackingNumber: order.tracking_number ?? null,
      carrierCode: order.carrier_code ?? null,
      shippedAt: order.shipped_at ?? null,
      trackingUrl,
      carrierTrackingUrl: carrierTrackingUrl(order.carrier_code as string | null, order.tracking_number as string | null),
      items: items.map((item) => ({ title: item.title, quantity: item.quantity, totalCents: item.total_cents })),
    },
    store: { nameAr: store.name_ar, nameEn: store.name_en, slug: store.slug },
  };
}

app.get("/api/store/:tenantSlug/track/:token", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string(), token: z.string().uuid() }).parse(request.params);
  const tenantRes = await pool.query(`SELECT * FROM tenants WHERE slug = $1 AND status NOT IN ('suspended', 'expired')`, [params.tenantSlug]);
  const tenant = tenantRes.rows[0];
  if (!tenant) return reply.code(404).send({ message: "Store not found" });
  const orderRes = await pool.query(`SELECT * FROM orders WHERE tenant_id = $1 AND tracking_token = $2`, [tenant.id, params.token]);
  const order = orderRes.rows[0];
  if (!order) return reply.code(404).send({ message: "Order not found" });
  const items = await pool.query(`SELECT title, quantity, total_cents FROM order_items WHERE order_id = $1 ORDER BY id`, [order.id]);
  return publicTrackPayload(order, items.rows, tenant, (path) => absoluteUrl(request, path));
});

app.post("/api/store/:tenantSlug/track", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string() }).parse(request.params);
  const body = z.object({ orderId: z.string().uuid(), phone: z.string().min(6) }).parse(request.body);
  const tenantRes = await pool.query(`SELECT * FROM tenants WHERE slug = $1 AND status NOT IN ('suspended', 'expired')`, [params.tenantSlug]);
  const tenant = tenantRes.rows[0];
  if (!tenant) return reply.code(404).send({ message: "Store not found" });
  const phoneDigits = body.phone.replace(/\D/g, "");
  const orderRes = await pool.query(
    `SELECT * FROM orders
     WHERE tenant_id = $1 AND id = $2
       AND regexp_replace(coalesce(customer_phone, ''), '\\D', '', 'g') LIKE $3`,
    [tenant.id, body.orderId, `%${phoneDigits.slice(-10)}%`],
  );
  const order = orderRes.rows[0];
  if (!order) return reply.code(404).send({ message: "لم يُعثر على الطلب. تحقق من رقم الطلب والموبايل." });
  const items = await pool.query(`SELECT title, quantity, total_cents FROM order_items WHERE order_id = $1 ORDER BY id`, [order.id]);
  return publicTrackPayload(order, items.rows, tenant, (path) => absoluteUrl(request, path));
});

app.get("/api/store/:tenantSlug/products/:productSlug/reviews", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string(), productSlug: z.string() }).parse(request.params);
  const tenantRes = await pool.query(`SELECT id, store_settings FROM tenants WHERE slug = $1`, [params.tenantSlug]);
  const tenant = tenantRes.rows[0];
  if (!tenant) return reply.code(404).send({ message: "Store not found" });
  const settings = parseStoreSettings(tenant.store_settings);
  if (!settings.reviewsEnabled) return { reviews: [], averageRating: null, count: 0 };
  const productRes = await pool.query(`SELECT id FROM products WHERE tenant_id = $1 AND slug = $2`, [tenant.id, params.productSlug]);
  if (!productRes.rows[0]) return reply.code(404).send({ message: "Product not found" });
  const result = await pool.query(
    `SELECT id, customer_name, rating, comment, created_at
     FROM product_reviews
     WHERE product_id = $1 AND status = 'published'
     ORDER BY created_at DESC
     LIMIT 50`,
    [productRes.rows[0].id],
  );
  const stats = await pool.query(
    `SELECT round(avg(rating)::numeric, 1) AS avg_rating, count(*)::int AS count
     FROM product_reviews WHERE product_id = $1 AND status = 'published'`,
    [productRes.rows[0].id],
  );
  return {
    reviews: result.rows,
    averageRating: stats.rows[0]?.avg_rating ? Number(stats.rows[0].avg_rating) : null,
    count: Number(stats.rows[0]?.count ?? 0),
  };
});

app.post("/api/store/:tenantSlug/products/:productSlug/reviews", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string(), productSlug: z.string() }).parse(request.params);
  const body = z
    .object({
      customerName: z.string().min(2).max(80),
      customerPhone: z.string().max(32).optional(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(2000).optional(),
    })
    .parse(request.body);
  const tenantRes = await pool.query(`SELECT id, store_settings FROM tenants WHERE slug = $1`, [params.tenantSlug]);
  const tenant = tenantRes.rows[0];
  if (!tenant) return reply.code(404).send({ message: "Store not found" });
  const settings = parseStoreSettings(tenant.store_settings);
  if (!settings.reviewsEnabled) return reply.code(403).send({ message: "التقييمات غير مفعّلة في هذا المتجر." });
  const productRes = await pool.query(`SELECT id FROM products WHERE tenant_id = $1 AND slug = $2 AND status = 'published'`, [
    tenant.id,
    params.productSlug,
  ]);
  if (!productRes.rows[0]) return reply.code(404).send({ message: "Product not found" });
  const result = await pool.query(
    `INSERT INTO product_reviews (tenant_id, product_id, customer_name, customer_phone, rating, comment, status)
     VALUES ($1,$2,$3,$4,$5,$6,'pending')
     RETURNING id, customer_name, rating, comment, status, created_at`,
    [tenant.id, productRes.rows[0].id, body.customerName.trim(), body.customerPhone?.trim() || null, body.rating, body.comment?.trim() || null],
  );
  return reply.code(201).send({ review: result.rows[0], message: "شكرًا! سيظهر تقييمك بعد موافقة المتجر." });
});

app.post("/api/webhooks/paymob", async (request, reply) => {
  const payload = request.body as Record<string, unknown>;
  const obj = ((payload.obj as Record<string, unknown> | undefined) ?? payload) as Record<string, unknown>;
  const query = (request.query ?? {}) as Record<string, unknown>;
  const receivedHmac = String(query.hmac || "");
  const orderId = String(obj.special_reference || obj.merchant_order_id || obj.order_id || "");
  const { success, pending, transactionId } = paymobTransactionState(obj);
  if (!orderId) return { ok: true, ignored: true };
  if (orderId.startsWith("subscription_invoice:")) {
    const invoiceId = parseSubscriptionInvoiceReference(orderId);
    if (!invoiceId) return { ok: true, ignored: true };
    const credentials = await pool.query(`SELECT encrypted_secret FROM platform_payment_credentials WHERE provider = 'paymob'`);
    const secret = credentials.rows[0] ? decodeSecret<{ hmacSecret?: string }>(credentials.rows[0].encrypted_secret) : null;
    if (secret?.hmacSecret && !paymobHmacMatches(obj, secret.hmacSecret, receivedHmac)) {
      return reply.code(401).send({ message: "Invalid Paymob webhook signature" });
    }
    if (success) {
      await markSubscriptionInvoicePaid(invoiceId, transactionId || null);
    } else {
      await pool.query(`UPDATE platform_subscription_invoices SET status = $1, provider = 'paymob', provider_reference = coalesce($3, provider_reference) WHERE id = $2`, [
        pending ? "pending" : "failed",
        invoiceId,
        transactionId || null,
      ]);
    }
    return { ok: true };
  }
  const orderCredentials = await pool.query(
    `SELECT credentials.encrypted_secret
     FROM orders
     JOIN tenant_payment_credentials credentials ON credentials.tenant_id = orders.tenant_id AND credentials.provider = 'paymob'
     WHERE orders.id = $1`,
    [orderId],
  );
  if (!orderCredentials.rows[0]) return { ok: true, ignored: true };
  const secret = decodeSecret<{ hmacSecret?: string }>(orderCredentials.rows[0].encrypted_secret);
  if (!secret.hmacSecret) {
    if (env.nodeEnv === "production") return reply.code(401).send({ message: "Paymob HMAC secret is not configured" });
  } else if (!paymobHmacMatches(obj, secret.hmacSecret, receivedHmac)) {
    return reply.code(401).send({ message: "Invalid Paymob webhook signature" });
  }
  const paymentStatus = success ? "paid" : pending ? "pending" : "failed";
  const orderStatus = success ? "confirmed" : pending ? "pending" : "cancelled";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE orders
       SET payment_status = $2,
           status = $3,
           payment_provider = 'paymob',
           payment_reference = coalesce($4, payment_reference)
       WHERE id = $1`,
      [orderId, paymentStatus, orderStatus, transactionId || null],
    );
    if (!success && !pending) {
      await restoreOrderStock(client, orderId);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (success) {
    void maybeSyncOrderToAccounting(pool, orderId, "paid");
  }
  return { ok: true };
});

app.post("/api/payments/paymob/return", async (request, reply) => {
  const payload = z.record(z.string(), z.unknown()).parse(request.body);
  const invoiceId = String(payload.subscription_invoice || parseSubscriptionInvoiceReference(String(payload.special_reference || payload.merchant_order_id || "")));
  if (!invoiceId) return { ok: true, status: "ignored" };

  const credentials = await pool.query(`SELECT encrypted_secret FROM platform_payment_credentials WHERE provider = 'paymob'`);
  const secret = credentials.rows[0] ? decodeSecret<{ hmacSecret?: string }>(credentials.rows[0].encrypted_secret) : null;
  if (secret?.hmacSecret) {
    const receivedHmac = String(payload.hmac || "");
    if (!paymobHmacMatches(payload, secret.hmacSecret, receivedHmac)) {
      return reply.code(401).send({ message: "Invalid Paymob return signature" });
    }
  } else {
    return { ok: true, status: "waiting_webhook", message: "Payment return received. Waiting for Paymob webhook because HMAC is not configured." };
  }

  const { success, pending, transactionId } = paymobTransactionState(payload);
  if (success) {
    const invoice = await markSubscriptionInvoicePaid(invoiceId, transactionId || null);
    return { ok: true, status: "paid", invoice };
  }

  const result = await pool.query(
    `UPDATE platform_subscription_invoices
     SET status = $1,
         provider = 'paymob',
         provider_reference = coalesce($3, provider_reference)
     WHERE id = $2
     RETURNING *`,
    [pending ? "pending" : "failed", invoiceId, transactionId || null],
  );
  return { ok: true, status: result.rows[0]?.status || "unknown", invoice: result.rows[0] };
});

app.post("/api/merchant/payment-providers/easycash", async (request) => {
  const user = requireMerchantUser(request);
  const body = z
    .object({
      mode: z.enum(["test", "live"]).default("test"),
      merchantId: z.string().min(1),
      apiKey: z.string().min(1),
      secret: z.string().min(1),
      enabled: z.boolean().default(false),
    })
    .parse(request.body);
  const publicConfig = { merchantId: body.merchantId, apiKeyLast4: body.apiKey.slice(-4) };
  const encryptedSecret = Buffer.from(JSON.stringify({ apiKey: body.apiKey, secret: body.secret, keyHint: env.encryptionKey.slice(0, 4) })).toString("base64");
  const result = await pool.query(
    `INSERT INTO tenant_payment_credentials (tenant_id, provider, mode, public_config, encrypted_secret, is_enabled)
     VALUES ($1, 'easycash', $2, $3, $4, $5)
     ON CONFLICT (tenant_id, provider)
     DO UPDATE SET mode = EXCLUDED.mode, public_config = EXCLUDED.public_config, encrypted_secret = EXCLUDED.encrypted_secret, is_enabled = EXCLUDED.is_enabled, updated_at = now()
     RETURNING id, tenant_id, provider, mode, public_config, is_enabled, updated_at`,
    [user.tenantId, body.mode, JSON.stringify(publicConfig), encryptedSecret, body.enabled],
  );
  return { credentials: result.rows[0] };
});

app.post("/api/merchant/subscription-invoices", async (request, reply) => {
  const user = requireMerchantUser(request);
  const body = z.object({ planCode: z.string().min(1) }).parse(request.body);
  const plan = await pool.query(`SELECT * FROM plans WHERE code = $1 AND is_active = true`, [body.planCode]);
  if (!plan.rows[0]) return reply.code(404).send({ message: "Plan not found" });
  const existing = await pool.query(
    `SELECT invoices.*, plans.name AS plan_name, plans.duration_months
     FROM platform_subscription_invoices invoices
     JOIN plans ON plans.code = invoices.plan_code
     WHERE invoices.tenant_id = $1 AND invoices.status = 'pending'
     ORDER BY invoices.created_at DESC
     LIMIT 1`,
    [user.tenantId],
  );
  if (existing.rows[0]) {
    return reply.code(200).send({ invoice: existing.rows[0], payment: { provider: existing.rows[0].provider, status: "pending_existing" } });
  }
  const result = await pool.query(
    `INSERT INTO platform_subscription_invoices (tenant_id, plan_code, amount_cents)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [user.tenantId, plan.rows[0].code, plan.rows[0].price_cents],
  );
  return reply.code(201).send({ invoice: result.rows[0], payment: { provider: "easycash", status: "pending_integration" } });
});

app.get("/api/merchant/subscription-invoices", async (request) => {
  const user = requireMerchantUser(request);
  const result = await pool.query(
    `SELECT invoices.*, plans.name AS plan_name, plans.duration_months
     FROM platform_subscription_invoices invoices
     JOIN plans ON plans.code = invoices.plan_code
     WHERE invoices.tenant_id = $1
     ORDER BY invoices.created_at DESC
     LIMIT 25`,
    [user.tenantId],
  );
  return { invoices: result.rows };
});

app.post("/api/merchant/subscription-invoices/:invoiceId/pay", async (request, reply) => {
  const user = requireMerchantUser(request);
  const params = z.object({ invoiceId: z.string().uuid() }).parse(request.params);
  const invoiceResult = await pool.query(
    `SELECT invoices.*,
            tenants.name_en AS tenant_name,
            users.name AS merchant_name,
            users.email AS merchant_email,
            users.phone AS merchant_phone
     FROM platform_subscription_invoices invoices
     JOIN tenants ON tenants.id = invoices.tenant_id
     LEFT JOIN users ON users.tenant_id = tenants.id AND users.role = 'merchant_owner'
     WHERE invoices.id = $1 AND invoices.tenant_id = $2`,
    [params.invoiceId, user.tenantId],
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return reply.code(404).send({ message: "Invoice not found" });
  if (invoice.status === "paid") return reply.code(400).send({ message: "Invoice already paid" });

  const gatewayResult = await pool.query(`SELECT * FROM platform_payment_credentials WHERE provider = 'paymob' AND is_enabled = true`);
  const gateway = gatewayResult.rows[0];
  if (!gateway) return reply.code(400).send({ message: "Platform Paymob is not configured yet" });

  const secret = decodeSecret<{ secretKey: string }>(gateway.encrypted_secret);
  const publicConfig = gateway.public_config as { publicKey: string; cardIntegrationId: number; currency?: string };
  assertPaymobPublicKey(publicConfig.publicKey);
  const merchantName = splitName(String(invoice.merchant_name || invoice.tenant_name || "Merchant Store"));
  const paymentReference = `subscription_invoice:${invoice.id}:${Date.now()}`;
  const intentionResponse = await fetch("https://accept.paymob.com/v1/intention/", {
    method: "POST",
    headers: { Authorization: `Token ${secret.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: invoice.amount_cents,
      currency: publicConfig.currency || "EGP",
      payment_methods: [Number(publicConfig.cardIntegrationId)],
      items: [
        {
          name: `Easy Shope ${invoice.plan_code}`.slice(0, 50),
          amount: invoice.amount_cents,
          description: `Platform subscription for ${invoice.tenant_name}`,
          quantity: 1,
        },
      ],
      billing_data: {
        first_name: merchantName.firstName,
        last_name: merchantName.lastName,
        phone_number: invoice.merchant_phone || "01000000000",
        email: invoice.merchant_email || "merchant@example.com",
        country: "EG",
        city: "Cairo",
        street: "NA",
        building: "NA",
        apartment: "NA",
        floor: "NA",
      },
      special_reference: paymentReference,
      notification_url: absoluteUrl(request, "/api/webhooks/paymob"),
      redirection_url: absoluteUrl(request, `/?subscription_invoice=${invoice.id}`),
      expiration: 3600,
    }),
  });
  const intention = await intentionResponse.json().catch(() => ({}));
  if (!intentionResponse.ok || !intention.client_secret) {
    return reply.code(400).send({
      message: paymobErrorMessage(intention),
      details: intention,
      hint: `Check platform Paymob mode (${gateway.mode}), public key, secret key, and card integration ID (${publicConfig.cardIntegrationId}).`,
    });
  }
  const checkoutUrl = paymobCheckoutUrl(publicConfig.publicKey, intention.client_secret);
  const result = await pool.query(
    `UPDATE platform_subscription_invoices
     SET status = 'pending',
         provider = 'paymob',
         provider_reference = $2
     WHERE id = $1
     RETURNING *`,
    [invoice.id, String(intention.id || intention.intention_order_id || "")],
  );
  return {
    invoice: result.rows[0],
    payment: {
      provider: "paymob",
      status: "redirect_required",
      checkoutUrl,
    },
  };
});

app.get("/api/admin/overview", async (request) => {
  requirePlatformOwner(request);
  const [tenants, orders, invoices, products, customers] = await Promise.all([
    pool.query(`SELECT status, count(*)::int AS count FROM tenants GROUP BY status`),
    pool.query(`SELECT count(*)::int AS count, coalesce(sum(total_cents), 0)::int AS total_cents FROM orders`),
    pool.query(`SELECT status, count(*)::int AS count, coalesce(sum(amount_cents), 0)::int AS total_cents FROM platform_subscription_invoices GROUP BY status`),
    pool.query(`SELECT count(*)::int AS count FROM products`),
    pool.query(`SELECT count(*)::int AS count FROM customers`),
  ]);
  return { tenants: tenants.rows, orders: orders.rows[0], subscriptionInvoices: invoices.rows, products: products.rows[0], customers: customers.rows[0] };
});

app.get("/api/admin/tenants", async (request) => {
  requirePlatformOwner(request);
  const result = await pool.query(
    `SELECT tenants.*,
            owner.name AS owner_name,
            owner.email AS owner_email,
            coalesce(product_counts.total, 0)::int AS products_count,
            coalesce(order_counts.total, 0)::int AS orders_count,
            coalesce(order_counts.revenue_cents, 0)::int AS revenue_cents
     FROM tenants
     LEFT JOIN LATERAL (
       SELECT name, email FROM users WHERE tenant_id = tenants.id AND role = 'merchant_owner' LIMIT 1
     ) owner ON true
     LEFT JOIN (
       SELECT tenant_id, count(*) AS total FROM products GROUP BY tenant_id
     ) product_counts ON product_counts.tenant_id = tenants.id
     LEFT JOIN (
       SELECT tenant_id, count(*) AS total, sum(total_cents) AS revenue_cents FROM orders GROUP BY tenant_id
     ) order_counts ON order_counts.tenant_id = tenants.id
     ORDER BY tenants.created_at DESC`,
  );
  return { tenants: result.rows };
});

app.patch("/api/admin/tenants/:tenantId/status", async (request) => {
  requirePlatformOwner(request);
  const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
  const body = z.object({ status: z.enum(["trial", "active", "suspended", "expired"]) }).parse(request.body);
  const result = await pool.query(`UPDATE tenants SET status = $1 WHERE id = $2 RETURNING *`, [body.status, params.tenantId]);
  return { tenant: result.rows[0] };
});

app.post("/api/admin/tenants/:tenantId/extend", async (request) => {
  requirePlatformOwner(request);
  const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
  const body = z.object({ months: z.number().int().positive().max(60), planCode: z.string().optional() }).parse(request.body);
  const result = await pool.query(
    `UPDATE tenants
     SET status = 'active',
         plan_code = coalesce($3, plan_code),
         subscription_expires_at = greatest(coalesce(subscription_expires_at, now()), now()) + ($1::text || ' months')::interval
     WHERE id = $2
     RETURNING *`,
    [body.months, params.tenantId, body.planCode ?? null],
  );
  return { tenant: result.rows[0] };
});

app.post("/api/admin/tenants/:tenantId/extend-trial", async (request) => {
  requirePlatformOwner(request);
  const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
  const body = z.object({ days: z.number().int().positive().max(365) }).parse(request.body);
  const result = await pool.query(
    `UPDATE tenants
     SET status = CASE WHEN status IN ('expired', 'trial') THEN 'trial' ELSE status END,
         subscription_expires_at = greatest(coalesce(subscription_expires_at, now()), now()) + ($1::text || ' days')::interval
     WHERE id = $2
     RETURNING *`,
    [body.days, params.tenantId],
  );
  if (!result.rows[0]) throw httpError("Tenant not found", 404);
  return { tenant: result.rows[0] };
});

app.get("/api/admin/platform-settings", async (request) => {
  requirePlatformOwner(request);
  const trialDaysDefault = await getTrialDaysDefault();
  return { trialDaysDefault };
});

app.patch("/api/admin/platform-settings", async (request) => {
  requirePlatformOwner(request);
  const body = z.object({ trialDaysDefault: z.number().int().min(1).max(365) }).parse(request.body);
  await setPlatformSetting("trial_days_default", String(body.trialDaysDefault));
  return { trialDaysDefault: body.trialDaysDefault };
});

app.get("/api/admin/plans", async (request) => {
  requirePlatformOwner(request);
  const result = await pool.query(`SELECT * FROM plans ORDER BY duration_months`);
  return { plans: result.rows };
});

app.patch("/api/admin/plans/:code", async (request) => {
  requirePlatformOwner(request);
  const params = z.object({ code: z.string().min(1) }).parse(request.params);
  const body = z.object({ name: z.string().min(1).optional(), priceCents: z.number().int().nonnegative().optional(), isActive: z.boolean().optional() }).parse(request.body);
  const result = await pool.query(
    `UPDATE plans
     SET name = coalesce($2, name),
         price_cents = coalesce($3, price_cents),
         is_active = coalesce($4, is_active)
     WHERE code = $1
     RETURNING *`,
    [params.code, body.name ?? null, body.priceCents ?? null, body.isActive ?? null],
  );
  return { plan: result.rows[0] };
});

app.get("/api/admin/payment-providers", async (request) => {
  requirePlatformOwner(request);
  const result = await pool.query(
    `SELECT id, provider, mode, public_config, is_enabled, updated_at
     FROM platform_payment_credentials
     ORDER BY updated_at DESC`,
  );
  return { providers: result.rows };
});

app.post("/api/admin/payment-providers/paymob", async (request) => {
  requirePlatformOwner(request);
  const body = z
    .object({
      mode: z.enum(["test", "live"]).default("test"),
      publicKey: z.string().min(8).optional(),
      secretKey: z.string().min(8).optional(),
      hmacSecret: z.string().optional(),
      cardIntegrationId: z.coerce.number().int().positive().optional(),
      walletIntegrationId: z.coerce.number().int().positive().optional(),
      currency: z.string().min(3).max(3).default("EGP"),
      enabled: z.boolean().default(false),
    })
    .parse(request.body);
  const existing = await pool.query(`SELECT * FROM platform_payment_credentials WHERE provider = 'paymob'`);
  const existingRow = existing.rows[0];
  if ((!body.publicKey || !body.secretKey || !body.cardIntegrationId) && !existingRow) {
    const error = new Error("Public Key, Secret Key, and Card Integration ID are required for the first save");
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }
  const existingConfig = (existingRow?.public_config ?? {}) as Record<string, unknown>;
  const existingSecret = existingRow ? decodeSecret<{ secretKey: string; hmacSecret?: string }>(existingRow.encrypted_secret) : null;
  const publicConfig = {
    publicKey: body.publicKey ?? existingConfig.publicKey,
    publicKeyLast8: (body.publicKey ?? String(existingConfig.publicKey ?? "")).slice(-8),
    cardIntegrationId: body.cardIntegrationId ?? existingConfig.cardIntegrationId,
    walletIntegrationId: body.walletIntegrationId ?? existingConfig.walletIntegrationId ?? null,
    currency: body.currency.toUpperCase(),
  };
  assertPaymobPublicKey(publicConfig.publicKey);
  const result = await pool.query(
    `INSERT INTO platform_payment_credentials (provider, mode, public_config, encrypted_secret, is_enabled)
     VALUES ('paymob', $1, $2, $3, $4)
     ON CONFLICT (provider)
     DO UPDATE SET mode = EXCLUDED.mode, public_config = EXCLUDED.public_config, encrypted_secret = EXCLUDED.encrypted_secret, is_enabled = EXCLUDED.is_enabled, updated_at = now()
     RETURNING id, provider, mode, public_config, is_enabled, updated_at`,
    [body.mode, JSON.stringify(publicConfig), encodeSecret({ secretKey: body.secretKey ?? existingSecret?.secretKey, hmacSecret: body.hmacSecret ?? existingSecret?.hmacSecret ?? "" }), body.enabled],
  );
  return { credentials: result.rows[0] };
});

app.post("/api/admin/payment-providers/paymob/test", async (request, reply) => {
  requirePlatformOwner(request);
  const result = await pool.query(`SELECT * FROM platform_payment_credentials WHERE provider = 'paymob'`);
  const credentials = result.rows[0];
  if (!credentials) return reply.code(404).send({ message: "Platform Paymob settings not found" });
  const secret = decodeSecret<{ secretKey: string }>(credentials.encrypted_secret);
  const response = await fetch("https://accept.paymob.com/v1/intention/", {
    method: "POST",
    headers: { Authorization: `Token ${secret.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: 100,
      currency: credentials.public_config.currency || "EGP",
      payment_methods: [Number(credentials.public_config.cardIntegrationId)],
      items: [{ name: "Platform test", amount: 100, description: "Easy Shope platform Paymob test", quantity: 1 }],
      billing_data: {
        first_name: "Easy",
        last_name: "Shope",
        phone_number: "01000000000",
        email: "owner@example.com",
        country: "EG",
        city: "Cairo",
        street: "NA",
        building: "NA",
        apartment: "NA",
        floor: "NA",
      },
      special_reference: `platform-test-${Date.now()}`,
      expiration: 600,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return reply.code(400).send({ ok: false, message: data.message || "Paymob connection failed", details: data });
  return { ok: true, provider: "paymob", intentionId: data.id, hasClientSecret: Boolean(data.client_secret) };
});

app.get("/api/admin/tenants/:tenantId", async (request, reply) => {
  requirePlatformOwner(request);
  const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
  const result = await pool.query(
    `SELECT tenants.*,
            coalesce(product_counts.total, 0)::int AS products_count,
            coalesce(order_counts.total, 0)::int AS orders_count,
            coalesce(order_counts.revenue_cents, 0)::int AS revenue_cents,
            owner.id AS owner_id,
            owner.name AS owner_name,
            owner.email AS owner_email,
            owner.phone AS owner_phone,
            owner.created_at AS owner_created_at,
            (SELECT count(*)::int FROM tenant_android_builds WHERE tenant_id = tenants.id) AS android_builds_count,
            (SELECT count(*)::int FROM tenant_android_builds WHERE tenant_id = tenants.id AND status = 'succeeded') AS android_builds_succeeded,
            EXISTS(SELECT 1 FROM tenant_payment_credentials WHERE tenant_id = tenants.id AND is_enabled = true) AS payment_enabled
     FROM tenants
     LEFT JOIN users owner ON owner.tenant_id = tenants.id AND owner.role = 'merchant_owner'
     LEFT JOIN (
       SELECT tenant_id, count(*) AS total FROM products GROUP BY tenant_id
     ) product_counts ON product_counts.tenant_id = tenants.id
     LEFT JOIN (
       SELECT tenant_id, count(*) AS total, sum(total_cents) AS revenue_cents FROM orders GROUP BY tenant_id
     ) order_counts ON order_counts.tenant_id = tenants.id
     WHERE tenants.id = $1`,
    [params.tenantId],
  );
  if (!result.rows[0]) return reply.code(404).send({ message: "Tenant not found" });
  const builds = await pool.query(
    `SELECT id, status, artifact_url, github_run_url, error_message, created_at, updated_at
     FROM tenant_android_builds WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 12`,
    [params.tenantId],
  );
  return { tenant: result.rows[0], androidBuilds: builds.rows };
});

app.get("/api/admin/orders", async (request) => {
  requirePlatformOwner(request);
  const query = z
    .object({
      status: z.string().optional(),
      tenantId: z.string().uuid().optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    })
    .parse(request.query);
  const limit = query.limit ?? 80;
  const conditions = ["1=1"];
  const params: unknown[] = [];
  if (query.status) {
    params.push(query.status);
    conditions.push(`orders.status = $${params.length}`);
  }
  if (query.tenantId) {
    params.push(query.tenantId);
    conditions.push(`orders.tenant_id = $${params.length}`);
  }
  params.push(limit);
  const result = await pool.query(
    `SELECT orders.*, tenants.name_en AS tenant_name, tenants.slug AS tenant_slug
     FROM orders
     JOIN tenants ON tenants.id = orders.tenant_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY orders.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return { orders: result.rows };
});

app.get("/api/admin/android-builds", async (request) => {
  requirePlatformOwner(request);
  const result = await pool.query(
    `SELECT b.*, t.name_en AS tenant_name, t.slug AS tenant_slug
     FROM tenant_android_builds b
     JOIN tenants t ON t.id = b.tenant_id
     ORDER BY b.created_at DESC
     LIMIT 80`,
  );
  return { builds: result.rows };
});

app.post("/api/admin/subscription-invoices", async (request, reply) => {
  requirePlatformOwner(request);
  const body = z.object({ tenantId: z.string().uuid(), planCode: z.string().min(1) }).parse(request.body);
  const plan = await pool.query(`SELECT * FROM plans WHERE code = $1`, [body.planCode]);
  if (!plan.rows[0]) return reply.code(404).send({ message: "Plan not found" });
  const tenant = await pool.query(`SELECT id FROM tenants WHERE id = $1`, [body.tenantId]);
  if (!tenant.rows[0]) return reply.code(404).send({ message: "Tenant not found" });
  const result = await pool.query(
    `INSERT INTO platform_subscription_invoices (tenant_id, plan_code, amount_cents)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [body.tenantId, plan.rows[0].code, plan.rows[0].price_cents],
  );
  return reply.code(201).send({ invoice: result.rows[0] });
});

app.get("/api/admin/subscription-invoices", async (request) => {
  requirePlatformOwner(request);
  const result = await pool.query(
    `SELECT invoices.*, tenants.name_en AS tenant_name, tenants.slug AS tenant_slug
     FROM platform_subscription_invoices invoices
     JOIN tenants ON tenants.id = invoices.tenant_id
     ORDER BY invoices.created_at DESC
     LIMIT 100`,
  );
  return { invoices: result.rows };
});

app.patch("/api/admin/subscription-invoices/:invoiceId/status", async (request) => {
  requirePlatformOwner(request);
  const params = z.object({ invoiceId: z.string().uuid() }).parse(request.params);
  const body = z.object({ status: z.enum(["pending", "paid", "expired", "failed", "cancelled"]) }).parse(request.body);
  if (body.status === "paid") {
    const invoice = await markSubscriptionInvoicePaid(params.invoiceId);
    return { invoice };
  }
  const result = await pool.query(`UPDATE platform_subscription_invoices SET status = $1 WHERE id = $2 RETURNING *`, [body.status, params.invoiceId]);
  return { invoice: result.rows[0] };
});

await migrate();

app.listen({ port: env.port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
