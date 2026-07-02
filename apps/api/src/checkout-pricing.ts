import type { Pool, PoolClient } from "pg";

export function effectiveUnitPriceCents(product: { price_cents: number; discount_percent?: number | null }): number {
  const base = Number(product.price_cents) || 0;
  const pct = Math.min(100, Math.max(0, Number(product.discount_percent) || 0));
  if (pct <= 0) return base;
  return Math.max(0, Math.round(base * (1 - pct / 100)));
}

export type CouponRow = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_order_cents: number;
  max_uses: number | null;
  used_count: number;
  expires_at: Date | null;
  is_active: boolean;
};

export function couponDiscountCents(coupon: CouponRow, subtotalCents: number): number {
  if (coupon.discount_type === "fixed") {
    return Math.min(subtotalCents, Math.max(0, coupon.discount_value));
  }
  const pct = Math.min(100, Math.max(0, coupon.discount_value));
  return Math.min(subtotalCents, Math.round(subtotalCents * (pct / 100)));
}

export async function resolveCoupon(
  db: Pool | PoolClient,
  tenantId: string,
  code: string | null | undefined,
  subtotalCents: number,
): Promise<{ coupon: CouponRow | null; discountCents: number; error?: string }> {
  const normalized = String(code || "")
    .trim()
    .toUpperCase();
  if (!normalized) return { coupon: null, discountCents: 0 };
  const result = await db.query(
    `SELECT * FROM coupons WHERE tenant_id = $1 AND upper(code) = $2 AND is_active = true LIMIT 1`,
    [tenantId, normalized],
  );
  const coupon = result.rows[0] as CouponRow | undefined;
  if (!coupon) return { coupon: null, discountCents: 0, error: "كود الخصم غير صالح." };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
    return { coupon: null, discountCents: 0, error: "انتهت صلاحية كود الخصم." };
  }
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
    return { coupon: null, discountCents: 0, error: "تم استخدام كود الخصم بالكامل." };
  }
  if (subtotalCents < coupon.min_order_cents) {
    return {
      coupon: null,
      discountCents: 0,
      error: `الحد الأدنى للطلب لاستخدام هذا الكود ${(coupon.min_order_cents / 100).toFixed(2)} جنيه.`,
    };
  }
  return { coupon, discountCents: couponDiscountCents(coupon, subtotalCents) };
}
