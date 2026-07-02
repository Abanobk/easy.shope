import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { effectiveUnitPriceCents, resolveCoupon } from "./checkout-pricing.js";
import { restoreOrderStock, reserveOrderStock } from "./inventory.js";
import { notifyNewStoreOrder } from "./notifications.js";
import { parseStoreSettings, publicCheckoutConfig, shippingFeeForGovernorate } from "./store-settings.js";

type Deps = {
  pool: Pool;
  expireOverdueSubscriptions: () => Promise<void>;
  httpError: (message: string, status?: number) => Error;
  splitName: (name: string) => { firstName: string; lastName: string };
  assertPaymobPublicKey: (key: string) => void;
  paymobCheckoutUrl: (publicKey: string, clientSecret: string) => string;
  decodeSecret: <T>(encrypted: string) => T;
  absoluteUrl: (request: FastifyRequest, path: string) => string;
  log: { error: (obj: unknown, msg?: string) => void };
};

const orderBodySchema = z.object({
  customerName: z.string().min(2),
  customerPhone: z.string().min(6),
  customerEmail: z.string().email().optional(),
  shippingAddress: z.string().optional(),
  governorate: z.string().min(1).optional(),
  paymentMethod: z.enum(["paymob", "cod", "fawry", "easycash"]).optional(),
  couponCode: z.string().max(64).optional(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
});

export type CheckoutQuote = {
  subtotalCents: number;
  discountCents: number;
  shippingFeeCents: number;
  codFeeCents: number;
  totalCents: number;
  couponCode: string | null;
  governorate: string | null;
  paymentMethod: string;
};

export async function buildCheckoutQuote(
  pool: Pool,
  tenantId: string,
  body: z.infer<typeof orderBodySchema>,
  settings: ReturnType<typeof parseStoreSettings>,
): Promise<{ quote: CheckoutQuote; itemRows: Array<{ product: Record<string, unknown>; quantity: number; lineTotal: number; unitPriceCents: number }>; couponId: string | null; couponError?: string }> {
  const productIds = body.items.map((item) => item.productId);
  const products = await pool.query(`SELECT * FROM products WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'published'`, [
    tenantId,
    productIds,
  ]);
  const byId = new Map(products.rows.map((product) => [product.id, product]));
  let subtotal = 0;
  const itemRows = body.items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) throw new Error(`Product not available: ${item.productId}`);
    if (product.stock_quantity < item.quantity) {
      throw new Error(`${product.title_ar || product.title_en} has only ${product.stock_quantity} items in stock`);
    }
    const unitPriceCents = effectiveUnitPriceCents(product);
    const lineTotal = unitPriceCents * item.quantity;
    subtotal += lineTotal;
    return { product, quantity: item.quantity, lineTotal, unitPriceCents };
  });

  const couponResult = await resolveCoupon(pool, tenantId, body.couponCode, subtotal);
  const shippingFeeCents = shippingFeeForGovernorate(settings, body.governorate, subtotal);
  const paymentMethod = body.paymentMethod || "paymob";
  const codFeeCents = paymentMethod === "cod" ? settings.codFeeCents : 0;
  const discountCents = couponResult.discountCents;
  const totalCents = Math.max(0, subtotal - discountCents + shippingFeeCents + codFeeCents);

  return {
    quote: {
      subtotalCents: subtotal,
      discountCents,
      shippingFeeCents,
      codFeeCents,
      totalCents,
      couponCode: couponResult.coupon?.code ?? (body.couponCode?.trim() ? body.couponCode.trim().toUpperCase() : null),
      governorate: body.governorate ?? null,
      paymentMethod,
    },
    itemRows,
    couponId: couponResult.coupon?.id ?? null,
    couponError: couponResult.error,
  };
}

export async function handleStoreCheckoutQuote(
  deps: Deps,
  request: FastifyRequest,
  reply: FastifyReply,
  tenantSlug: string,
  body: unknown,
) {
  const parsed = orderBodySchema.parse(body);
  await deps.expireOverdueSubscriptions();
  const tenantResult = await deps.pool.query(`SELECT * FROM tenants WHERE slug = $1 AND status NOT IN ('suspended', 'expired')`, [tenantSlug]);
  const tenant = tenantResult.rows[0];
  if (!tenant) return reply.code(404).send({ message: "Store not found" });
  const settings = parseStoreSettings(tenant.store_settings);
  try {
    const { quote, couponError } = await buildCheckoutQuote(deps.pool, tenant.id as string, parsed, settings);
    return { quote, checkout: publicCheckoutConfig(settings), couponError: couponError ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return reply.code(400).send({ message });
  }
}

export async function handleCreateStoreOrder(deps: Deps, request: FastifyRequest, reply: FastifyReply, tenantSlug: string, body: unknown) {
  const parsed = orderBodySchema.parse(body);
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await deps.expireOverdueSubscriptions();
    const tenantResult = await client.query(`SELECT * FROM tenants WHERE slug = $1 AND status NOT IN ('suspended', 'expired') FOR UPDATE`, [tenantSlug]);
    const tenant = tenantResult.rows[0];
    if (!tenant) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ message: "Store not found" });
    }

    const settings = parseStoreSettings(tenant.store_settings);
    const paymentMethod = parsed.paymentMethod || "paymob";
    if (!settings.paymentMethods[paymentMethod as keyof typeof settings.paymentMethods]) {
      await client.query("ROLLBACK");
      return reply.code(400).send({ message: "طريقة الدفع غير متاحة لهذا المتجر." });
    }

    const productIds = parsed.items.map((item) => item.productId);
    const products = await client.query(
      `SELECT * FROM products WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'published' FOR UPDATE`,
      [tenant.id, productIds],
    );
    const byId = new Map(products.rows.map((product) => [product.id, product]));
    let subtotal = 0;
    const itemRows = parsed.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw deps.httpError(`Product not available: ${item.productId}`, 400);
      if (product.stock_quantity < item.quantity) {
        throw deps.httpError(`${product.title_ar || product.title_en} has only ${product.stock_quantity} items in stock`, 400);
      }
      const unitPriceCents = effectiveUnitPriceCents(product);
      const lineTotal = unitPriceCents * item.quantity;
      subtotal += lineTotal;
      return { product, quantity: item.quantity, lineTotal, unitPriceCents };
    });

    const couponResult = await resolveCoupon(client, tenant.id as string, parsed.couponCode, subtotal);
    if (parsed.couponCode?.trim() && couponResult.error) {
      await client.query("ROLLBACK");
      return reply.code(400).send({ message: couponResult.error });
    }
    const shippingFeeCents = shippingFeeForGovernorate(settings, parsed.governorate, subtotal);
    const codFeeCents = paymentMethod === "cod" ? settings.codFeeCents : 0;
    const discountCents = couponResult.discountCents;
    const totalCents = Math.max(0, subtotal - discountCents + shippingFeeCents + codFeeCents);

    const customer = await client.query(
      `INSERT INTO customers (tenant_id, name, email, phone) VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenant.id, parsed.customerName, parsed.customerEmail ?? null, parsed.customerPhone],
    );
    const order = await client.query(
      `INSERT INTO orders (
         tenant_id, customer_id, total_cents, subtotal_cents, shipping_fee_cents, discount_cents,
         coupon_code, governorate, payment_method, customer_name, customer_phone, customer_email, shipping_address,
         payment_provider, payment_status, status, tracking_token
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$9,$14,$15, gen_random_uuid())
       RETURNING *`,
      [
        tenant.id,
        customer.rows[0].id,
        totalCents,
        subtotal,
        shippingFeeCents,
        discountCents,
        couponResult.coupon?.code ?? null,
        parsed.governorate ?? null,
        paymentMethod,
        parsed.customerName,
        parsed.customerPhone,
        parsed.customerEmail ?? null,
        parsed.shippingAddress ?? null,
        paymentMethod === "cod" || paymentMethod === "fawry" ? "unpaid" : "unpaid",
        paymentMethod === "cod" ? "confirmed" : "pending",
      ],
    );
    for (const item of itemRows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, title, quantity, unit_price_cents, total_cents)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.rows[0].id, item.product.id, item.product.title_en, item.quantity, item.unitPriceCents, item.lineTotal],
      );
    }
    if (couponResult.coupon?.id) {
      await client.query(`UPDATE coupons SET used_count = used_count + 1 WHERE id = $1`, [couponResult.coupon.id]);
    }
    await reserveOrderStock(
      client,
      itemRows.map((item) => ({ productId: item.product.id as string, quantity: item.quantity })),
    );
    await client.query("COMMIT");

    const trackingUrl = order.rows[0].tracking_token
      ? deps.absoluteUrl(request, `/store/${tenantSlug}/track/${order.rows[0].tracking_token}`)
      : null;

    const notifyOrder = (checkoutUrl?: string | null) => {
      void notifyNewStoreOrder(deps.pool, {
        tenantId: tenant.id as string,
        orderId: order.rows[0].id as string,
        totalCents,
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        customerEmail: parsed.customerEmail ?? null,
        checkoutUrl: checkoutUrl ?? null,
        trackingUrl,
      }).catch((err) => deps.log.error({ err }, "order notification failed"));
    };

    if (paymentMethod === "cod") {
      notifyOrder();
      return reply.code(201).send({
        order: order.rows[0],
        trackingUrl,
        payment: {
          status: "cod_pending",
          provider: "cod",
          message: "تم استلام طلبك. سيتم التواصل معك لتأكيد التوصيل والدفع عند الاستلام.",
        },
        quote: { subtotalCents: subtotal, discountCents, shippingFeeCents, codFeeCents, totalCents },
      });
    }

    if (paymentMethod === "fawry") {
      notifyOrder();
      return reply.code(201).send({
        order: order.rows[0],
        trackingUrl,
        payment: {
          status: "fawry_pending",
          provider: "fawry",
          message: "تم إنشاء الطلب. سيتواصل معك فريق المتجر بكود Fawry للدفع أو يمكنك الدفع عند الاستلام حسب سياسة المتجر.",
        },
        quote: { subtotalCents: subtotal, discountCents, shippingFeeCents, codFeeCents, totalCents },
      });
    }

    if (paymentMethod === "easycash") {
      const easycash = await deps.pool.query(
        `SELECT * FROM tenant_payment_credentials WHERE tenant_id = $1 AND provider = 'easycash' AND is_enabled = true`,
        [tenant.id],
      );
      if (!easycash.rows[0]) {
        return reply.code(400).send({ message: "Easy Cash غير مفعّل لهذا المتجر." });
      }
      notifyOrder();
      return reply.code(201).send({
        order: order.rows[0],
        trackingUrl,
        payment: {
          status: "easycash_pending",
          provider: "easycash",
          message: "تم إنشاء الطلب. سيتواصل معك المتجر برابط الدفع عبر Easy Cash أو يؤكد الطلب يدويًا.",
        },
        quote: { subtotalCents: subtotal, discountCents, shippingFeeCents, codFeeCents, totalCents },
      });
    }

    const paymob = await deps.pool.query(`SELECT * FROM tenant_payment_credentials WHERE tenant_id = $1 AND provider = 'paymob' AND is_enabled = true`, [
      tenant.id,
    ]);
    const credentials = paymob.rows[0];
    if (!credentials) {
      notifyOrder();
      return reply.code(201).send({
        order: order.rows[0],
        trackingUrl,
        payment: { status: "pending", provider: "manual_until_paymob_connected", message: "ادفع يدوياً أو تواصل مع المتجر." },
        quote: { subtotalCents: subtotal, discountCents, shippingFeeCents, codFeeCents, totalCents },
      });
    }

    const secret = deps.decodeSecret<{ secretKey: string }>(credentials.encrypted_secret);
    const publicConfig = credentials.public_config as { publicKey: string; cardIntegrationId: number; currency?: string };
    deps.assertPaymobPublicKey(publicConfig.publicKey);
    const { firstName, lastName } = deps.splitName(parsed.customerName);
    const intentionResponse = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: { Authorization: `Token ${secret.secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: totalCents,
        currency: publicConfig.currency || "EGP",
        payment_methods: [Number(publicConfig.cardIntegrationId)],
        items: itemRows.map((item) => ({
          name: String(item.product.title_en).slice(0, 50),
          amount: item.lineTotal,
          description: item.product.description || item.product.title_en,
          quantity: item.quantity,
        })),
        billing_data: {
          first_name: firstName,
          last_name: lastName,
          phone_number: parsed.customerPhone,
          email: parsed.customerEmail || "customer@example.com",
          country: "EG",
          city: parsed.governorate || "Cairo",
          street: parsed.shippingAddress || "NA",
          building: "NA",
          apartment: "NA",
          floor: "NA",
        },
        special_reference: order.rows[0].id,
        notification_url: deps.absoluteUrl(request, "/api/webhooks/paymob"),
        redirection_url: deps.absoluteUrl(request, `/?order=${order.rows[0].id}`),
        expiration: 3600,
      }),
    });
    const intention = await intentionResponse.json().catch(() => ({}));
    if (!intentionResponse.ok || !intention.client_secret) {
      await restoreOrderStock(deps.pool, order.rows[0].id as string);
      await deps.pool.query(`UPDATE orders SET payment_provider = 'paymob', payment_reference = $2, status = 'cancelled', payment_status = 'failed' WHERE id = $1`, [
        order.rows[0].id,
        intention.id ? String(intention.id) : null,
      ]);
      return reply.code(201).send({
        order: { ...order.rows[0], status: "cancelled", payment_status: "failed" },
        payment: { status: "failed", provider: "paymob", message: intention.message || "Paymob intention creation failed", details: intention },
      });
    }
    const checkoutUrl = deps.paymobCheckoutUrl(publicConfig.publicKey, intention.client_secret);
    const updatedOrder = await deps.pool.query(
      `UPDATE orders SET payment_provider = 'paymob', payment_reference = $2, checkout_url = $3 WHERE id = $1 RETURNING *`,
      [order.rows[0].id, String(intention.id || intention.intention_order_id || ""), checkoutUrl],
    );
    notifyOrder(checkoutUrl);
    return reply.code(201).send({
      order: updatedOrder.rows[0],
      trackingUrl,
      payment: { status: "redirect_required", provider: "paymob", checkoutUrl },
      quote: { subtotalCents: subtotal, discountCents, shippingFeeCents, codFeeCents, totalCents },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
