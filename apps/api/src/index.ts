import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import bcrypt from "bcryptjs";
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
    await client.query("ROLLBACK");
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

app.get("/api/store/:tenantSlug/products", async (request) => {
  const params = z.object({ tenantSlug: z.string() }).parse(request.params);
  const result = await pool.query(
    `SELECT products.*
     FROM products JOIN tenants ON tenants.id = products.tenant_id
     WHERE tenants.slug = $1 AND products.status = 'published'
     ORDER BY products.created_at DESC`,
    [params.tenantSlug],
  );
  return { products: result.rows };
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
    const tenantResult = await client.query(`SELECT * FROM tenants WHERE slug = $1 AND status <> 'suspended'`, [params.tenantSlug]);
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
    return reply.code(201).send({ order: order.rows[0], payment: { status: "pending", provider: "manual_until_easycash_connected" } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

app.get("/api/admin/overview", async (request) => {
  requirePlatformOwner(request);
  const [tenants, orders, invoices] = await Promise.all([
    pool.query(`SELECT status, count(*)::int AS count FROM tenants GROUP BY status`),
    pool.query(`SELECT count(*)::int AS count, coalesce(sum(total_cents), 0)::int AS total_cents FROM orders`),
    pool.query(`SELECT status, count(*)::int AS count, coalesce(sum(amount_cents), 0)::int AS total_cents FROM platform_subscription_invoices GROUP BY status`),
  ]);
  return { tenants: tenants.rows, orders: orders.rows[0], subscriptionInvoices: invoices.rows };
});

app.get("/api/admin/tenants", async (request) => {
  requirePlatformOwner(request);
  const result = await pool.query(`SELECT * FROM tenants ORDER BY created_at DESC`);
  return { tenants: result.rows };
});

app.patch("/api/admin/tenants/:tenantId/status", async (request) => {
  requirePlatformOwner(request);
  const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
  const body = z.object({ status: z.enum(["trial", "active", "suspended", "expired"]) }).parse(request.body);
  const result = await pool.query(`UPDATE tenants SET status = $1 WHERE id = $2 RETURNING *`, [body.status, params.tenantId]);
  return { tenant: result.rows[0] };
});

await migrate();

app.listen({ port: env.port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
