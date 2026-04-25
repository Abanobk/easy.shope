import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import pg from "pg";
import { z } from "zod";

const { Pool } = pg;

const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://easy_shope:easy_shope_dev@postgres:5432/easy_shope",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "dev-only-change-me",
  platformOwnerEmail: process.env.PLATFORM_OWNER_EMAIL ?? "owner@easyshope.local",
  platformOwnerPassword: process.env.PLATFORM_OWNER_PASSWORD ?? "ChangeMe123!",
};

type AuthUser = {
  userId: string;
  tenantId: string | null;
  role: "platform_owner" | "platform_admin" | "merchant_owner" | "merchant_staff" | "customer";
};

const pool = new Pool({ connectionString: env.databaseUrl });
const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

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

function requireTenantUser(request: Parameters<typeof getAuth>[0]) {
  const user = requireAuth(request);
  if (!user.tenantId) {
    const error = new Error("Tenant required");
    (error as Error & { statusCode: number }).statusCode = 403;
    throw error;
  }
  return user;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

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

async function expireOverdueSubscriptions() {
  await pool.query(
    `UPDATE tenants
     SET status = 'expired'
     WHERE subscription_expires_at IS NOT NULL
       AND subscription_expires_at < now()
       AND status NOT IN ('suspended', 'expired')`,
  );
}

async function markSubscriptionInvoicePaid(invoiceId: string) {
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
    const updatedInvoice = await client.query(
      `UPDATE platform_subscription_invoices
       SET status = 'paid', provider_reference = coalesce(provider_reference, $2)
       WHERE id = $1
       RETURNING *`,
      [invoiceId, `manual-paid-${Date.now()}`],
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
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider text;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference text;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_url text;
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

app.get("/health", async () => {
  const db = await pool.query("SELECT 1 AS ok");
  return { ok: true, service: "easy-shope-api", db: db.rows[0].ok === 1 };
});

app.get("/api/health", async () => ({ ok: true, service: "easy-shope-api" }));

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
  const passwordHash = await bcrypt.hash(body.password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tenant = await client.query(
      `INSERT INTO tenants (name_ar, name_en, slug, country)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [body.storeNameAr, body.storeNameEn, slug, body.country],
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
  const token = signToken({ userId: user.id, tenantId: user.tenant_id, role: user.role });
  return { token, user: { id: user.id, tenantId: user.tenant_id, name: user.name, email: user.email, role: user.role } };
});

app.get("/api/me", async (request) => {
  const user = requireAuth(request);
  const result = await pool.query(
    `SELECT users.id, users.name, users.email, users.role, users.tenant_id, tenants.name_en AS store_name, tenants.slug
     FROM users LEFT JOIN tenants ON tenants.id = users.tenant_id
     WHERE users.id = $1`,
    [user.userId],
  );
  return result.rows[0];
});

app.get("/api/plans", async () => {
  const result = await pool.query(`SELECT * FROM plans WHERE is_active = true ORDER BY duration_months`);
  return { plans: result.rows };
});

app.post("/api/merchant/categories", async (request, reply) => {
  const user = requireTenantUser(request);
  const body = z.object({ nameAr: z.string().min(1), nameEn: z.string().min(1), parentId: z.string().uuid().optional() }).parse(request.body);
  const result = await pool.query(
    `INSERT INTO categories (tenant_id, parent_id, name_ar, name_en, slug)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [user.tenantId, body.parentId ?? null, body.nameAr, body.nameEn, slugify(body.nameEn)],
  );
  return reply.code(201).send({ category: result.rows[0] });
});

app.get("/api/merchant/categories", async (request) => {
  const user = requireTenantUser(request);
  const result = await pool.query(`SELECT * FROM categories WHERE tenant_id = $1 ORDER BY sort_order, created_at DESC`, [user.tenantId]);
  return { categories: result.rows };
});

app.post("/api/merchant/products", async (request, reply) => {
  const user = requireTenantUser(request);
  const body = z
    .object({
      categoryId: z.string().uuid().optional(),
      titleAr: z.string().min(1),
      titleEn: z.string().min(1),
      description: z.string().optional(),
      priceCents: z.number().int().nonnegative(),
      compareAtPriceCents: z.number().int().nonnegative().optional(),
      sku: z.string().optional(),
      stockQuantity: z.number().int().nonnegative().default(0),
      status: z.enum(["draft", "published"]).default("draft"),
      imageUrl: z.string().url().optional(),
    })
    .parse(request.body);
  const result = await pool.query(
    `INSERT INTO products (tenant_id, category_id, title_ar, title_en, slug, description, price_cents, compare_at_price_cents, sku, stock_quantity, status, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      user.tenantId,
      body.categoryId ?? null,
      body.titleAr,
      body.titleEn,
      slugify(body.titleEn),
      body.description ?? null,
      body.priceCents,
      body.compareAtPriceCents ?? null,
      body.sku ?? null,
      body.stockQuantity,
      body.status,
      body.imageUrl ?? null,
    ],
  );
  return reply.code(201).send({ product: result.rows[0] });
});

app.get("/api/merchant/products", async (request) => {
  const user = requireTenantUser(request);
  const result = await pool.query(`SELECT * FROM products WHERE tenant_id = $1 ORDER BY created_at DESC`, [user.tenantId]);
  return { products: result.rows };
});

app.get("/api/merchant/orders", async (request) => {
  const user = requireTenantUser(request);
  const result = await pool.query(`SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC`, [user.tenantId]);
  return { orders: result.rows };
});

app.get("/api/merchant/payment-providers", async (request) => {
  const user = requireTenantUser(request);
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
  const user = requireTenantUser(request);
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
  const user = requireTenantUser(request);
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
  const user = requireTenantUser(request);
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
  const user = requireTenantUser(request);
  const result = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [user.tenantId]);
  return { store: result.rows[0] };
});

app.patch("/api/merchant/store", async (request) => {
  const user = requireTenantUser(request);
  const body = z
    .object({
      nameAr: z.string().min(2).optional(),
      nameEn: z.string().min(2).optional(),
      country: z.string().min(2).optional(),
    })
    .parse(request.body);
  const result = await pool.query(
    `UPDATE tenants
     SET name_ar = coalesce($2, name_ar),
         name_en = coalesce($3, name_en),
         country = coalesce($4, country)
     WHERE id = $1
     RETURNING *`,
    [user.tenantId, body.nameAr ?? null, body.nameEn ?? null, body.country ?? null],
  );
  return { store: result.rows[0] };
});

app.get("/api/store/:tenantSlug", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string() }).parse(request.params);
  await expireOverdueSubscriptions();
  const [tenant, categories, products] = await Promise.all([
    pool.query(`SELECT id, name_ar, name_en, slug, country, status, plan_code FROM tenants WHERE slug = $1 AND status NOT IN ('suspended', 'expired')`, [
      params.tenantSlug,
    ]),
    pool.query(
      `SELECT categories.id, categories.name_ar, categories.name_en, categories.slug, count(products.id)::int AS products_count
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
  return { store: tenant.rows[0], categories: categories.rows, featuredProducts: products.rows };
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
  return { products: result.rows };
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
  return { product: result.rows[0] };
});

app.post("/api/store/:tenantSlug/orders", async (request, reply) => {
  const params = z.object({ tenantSlug: z.string() }).parse(request.params);
  const body = z
    .object({
      customerName: z.string().min(2),
      customerPhone: z.string().min(6),
      customerEmail: z.string().email().optional(),
      shippingAddress: z.string().optional(),
      items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
    })
    .parse(request.body);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await expireOverdueSubscriptions();
    const tenantResult = await client.query(`SELECT * FROM tenants WHERE slug = $1 AND status NOT IN ('suspended', 'expired')`, [params.tenantSlug]);
    const tenant = tenantResult.rows[0];
    if (!tenant) return reply.code(404).send({ message: "Store not found" });

    const productIds = body.items.map((item) => item.productId);
    const products = await client.query(`SELECT * FROM products WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'published'`, [
      tenant.id,
      productIds,
    ]);
    const byId = new Map(products.rows.map((product) => [product.id, product]));
    let total = 0;
    const itemRows = body.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new Error(`Product not available: ${item.productId}`);
      const lineTotal = product.price_cents * item.quantity;
      total += lineTotal;
      return { product, quantity: item.quantity, lineTotal };
    });

    const customer = await client.query(
      `INSERT INTO customers (tenant_id, name, email, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenant.id, body.customerName, body.customerEmail ?? null, body.customerPhone],
    );
    const order = await client.query(
      `INSERT INTO orders (tenant_id, customer_id, total_cents, customer_name, customer_phone, customer_email, shipping_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [tenant.id, customer.rows[0].id, total, body.customerName, body.customerPhone, body.customerEmail ?? null, body.shippingAddress ?? null],
    );
    for (const item of itemRows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, title, quantity, unit_price_cents, total_cents)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.rows[0].id, item.product.id, item.product.title_en, item.quantity, item.product.price_cents, item.lineTotal],
      );
    }
    await client.query("COMMIT");

    const paymob = await pool.query(
      `SELECT * FROM tenant_payment_credentials WHERE tenant_id = $1 AND provider = 'paymob' AND is_enabled = true`,
      [tenant.id],
    );
    const credentials = paymob.rows[0];
    if (!credentials) {
      return reply.code(201).send({ order: order.rows[0], payment: { status: "pending", provider: "manual_until_paymob_connected" } });
    }

    const secret = decodeSecret<{ secretKey: string }>(credentials.encrypted_secret);
    const publicConfig = credentials.public_config as { publicKey: string; cardIntegrationId: number; currency?: string };
    const { firstName, lastName } = splitName(body.customerName);
    const intentionResponse = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: { Authorization: `Token ${secret.secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: total,
        currency: publicConfig.currency || "EGP",
        payment_methods: [Number(publicConfig.cardIntegrationId)],
        items: itemRows.map((item) => ({
          name: item.product.title_en.slice(0, 50),
          amount: item.lineTotal,
          description: item.product.description || item.product.title_en,
          quantity: item.quantity,
        })),
        billing_data: {
          first_name: firstName,
          last_name: lastName,
          phone_number: body.customerPhone,
          email: body.customerEmail || "customer@example.com",
          country: "EG",
          city: "Cairo",
          street: body.shippingAddress || "NA",
          building: "NA",
          apartment: "NA",
          floor: "NA",
        },
        special_reference: order.rows[0].id,
        notification_url: absoluteUrl(request, "/api/webhooks/paymob"),
        redirection_url: absoluteUrl(request, `/?order=${order.rows[0].id}`),
        expiration: 3600,
      }),
    });
    const intention = await intentionResponse.json().catch(() => ({}));
    if (!intentionResponse.ok || !intention.client_secret) {
      await pool.query(`UPDATE orders SET payment_provider = 'paymob', payment_reference = $2 WHERE id = $1`, [
        order.rows[0].id,
        intention.id ? String(intention.id) : null,
      ]);
      return reply.code(201).send({
        order: order.rows[0],
        payment: { status: "pending", provider: "paymob", message: intention.message || "Paymob intention creation failed", details: intention },
      });
    }
    const checkoutUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${encodeURIComponent(publicConfig.publicKey)}&clientSecret=${encodeURIComponent(
      intention.client_secret,
    )}`;
    const updatedOrder = await pool.query(
      `UPDATE orders SET payment_provider = 'paymob', payment_reference = $2, checkout_url = $3 WHERE id = $1 RETURNING *`,
      [order.rows[0].id, String(intention.id || intention.intention_order_id || ""), checkoutUrl],
    );
    return reply.code(201).send({ order: updatedOrder.rows[0], payment: { status: "redirect_required", provider: "paymob", checkoutUrl } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

app.post("/api/webhooks/paymob", async (request) => {
  const payload = request.body as Record<string, unknown>;
  const obj = ((payload.obj as Record<string, unknown> | undefined) ?? payload) as Record<string, unknown>;
  const orderId = String(obj.special_reference || obj.merchant_order_id || obj.order_id || "");
  const success = obj.success === true || obj.success === "true";
  const pending = obj.pending === true || obj.pending === "true";
  const transactionId = String(obj.id || obj.transaction_id || obj.payment_key_claims || "");
  if (!orderId) return { ok: true, ignored: true };
  if (orderId.startsWith("subscription_invoice:")) {
    const invoiceId = orderId.replace("subscription_invoice:", "");
    if (success) {
      await markSubscriptionInvoicePaid(invoiceId);
    } else {
      await pool.query(`UPDATE platform_subscription_invoices SET status = $1, provider = 'paymob', provider_reference = coalesce($3, provider_reference) WHERE id = $2`, [
        pending ? "pending" : "failed",
        invoiceId,
        transactionId || null,
      ]);
    }
    return { ok: true };
  }
  const paymentStatus = success ? "paid" : pending ? "pending" : "failed";
  const orderStatus = success ? "confirmed" : "pending";
  await pool.query(
    `UPDATE orders
     SET payment_status = $2,
         status = $3,
         payment_provider = 'paymob',
         payment_reference = coalesce($4, payment_reference)
     WHERE id = $1`,
    [orderId, paymentStatus, orderStatus, transactionId || null],
  );
  return { ok: true };
});

app.post("/api/merchant/payment-providers/easycash", async (request) => {
  const user = requireTenantUser(request);
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
  const user = requireTenantUser(request);
  const body = z.object({ planCode: z.string().min(1) }).parse(request.body);
  const plan = await pool.query(`SELECT * FROM plans WHERE code = $1 AND is_active = true`, [body.planCode]);
  if (!plan.rows[0]) return reply.code(404).send({ message: "Plan not found" });
  const result = await pool.query(
    `INSERT INTO platform_subscription_invoices (tenant_id, plan_code, amount_cents)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [user.tenantId, plan.rows[0].code, plan.rows[0].price_cents],
  );
  return reply.code(201).send({ invoice: result.rows[0], payment: { provider: "easycash", status: "pending_integration" } });
});

app.get("/api/merchant/subscription-invoices", async (request) => {
  const user = requireTenantUser(request);
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
  const user = requireTenantUser(request);
  const params = z.object({ invoiceId: z.string().uuid() }).parse(request.params);
  const invoiceResult = await pool.query(
    `SELECT invoices.*, tenants.name_en AS tenant_name
     FROM platform_subscription_invoices invoices
     JOIN tenants ON tenants.id = invoices.tenant_id
     WHERE invoices.id = $1 AND invoices.tenant_id = $2`,
    [params.invoiceId, user.tenantId],
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) return reply.code(404).send({ message: "Invoice not found" });

  const gatewayResult = await pool.query(`SELECT * FROM platform_payment_credentials WHERE provider = 'paymob' AND is_enabled = true`);
  const gateway = gatewayResult.rows[0];
  if (!gateway) return reply.code(400).send({ message: "Platform Paymob is not configured yet" });

  const secret = decodeSecret<{ secretKey: string }>(gateway.encrypted_secret);
  const publicConfig = gateway.public_config as { publicKey: string; cardIntegrationId: number; currency?: string };
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
        first_name: invoice.tenant_name || "Merchant",
        last_name: "Store",
        phone_number: "01000000000",
        email: "merchant@example.com",
        country: "EG",
        city: "Cairo",
        street: "NA",
        building: "NA",
        apartment: "NA",
        floor: "NA",
      },
      special_reference: `subscription_invoice:${invoice.id}`,
      notification_url: absoluteUrl(request, "/api/webhooks/paymob"),
      redirection_url: absoluteUrl(request, `/?subscription_invoice=${invoice.id}`),
      expiration: 3600,
    }),
  });
  const intention = await intentionResponse.json().catch(() => ({}));
  if (!intentionResponse.ok || !intention.client_secret) {
    return reply.code(400).send({ message: intention.message || "Paymob intention creation failed", details: intention });
  }
  const checkoutUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${encodeURIComponent(publicConfig.publicKey)}&clientSecret=${encodeURIComponent(
    intention.client_secret,
  )}`;
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
            coalesce(product_counts.total, 0)::int AS products_count,
            coalesce(order_counts.total, 0)::int AS orders_count,
            coalesce(order_counts.revenue_cents, 0)::int AS revenue_cents
     FROM tenants
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
