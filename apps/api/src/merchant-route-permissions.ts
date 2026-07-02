import type { FastifyRequest } from "fastify";
import type pg from "pg";
import type { PermissionAction, PermissionModule } from "./permissions.js";
import { requirePerm } from "./merchant-auth.js";

type TenantAuthUser = {
  userId: string;
  tenantId: string;
  role: string;
};

type RouteRule = { module: PermissionModule; action: PermissionAction } | { ownerOnly: true };

export const MERCHANT_ROUTE_RULES: Record<string, RouteRule> = {
  "GET /api/merchant/dashboard": { module: "dashboard", action: "view" },
  "GET /api/merchant/categories": { module: "categories", action: "view" },
  "POST /api/merchant/categories": { module: "categories", action: "create" },
  "PATCH /api/merchant/categories/:categoryId": { module: "categories", action: "edit" },
  "DELETE /api/merchant/categories/:categoryId": { module: "categories", action: "delete" },
  "GET /api/merchant/products": { module: "products", action: "view" },
  "POST /api/merchant/products": { module: "products", action: "create" },
  "PATCH /api/merchant/products/:productId": { module: "products", action: "edit" },
  "DELETE /api/merchant/products/:productId": { module: "products", action: "delete" },
  "GET /api/merchant/orders": { module: "orders", action: "view" },
  "GET /api/merchant/orders/:orderId": { module: "orders", action: "view" },
  "PATCH /api/merchant/orders/:orderId/status": { module: "orders", action: "edit" },
  "PATCH /api/merchant/orders/:orderId/shipping": { module: "orders", action: "edit" },
  "GET /api/merchant/reviews": { module: "reviews", action: "view" },
  "PATCH /api/merchant/reviews/:reviewId": { module: "reviews", action: "edit" },
  "DELETE /api/merchant/reviews/:reviewId": { module: "reviews", action: "delete" },
  "GET /api/merchant/payment-providers": { module: "providers", action: "view" },
  "POST /api/merchant/payment-providers/paymob": { module: "providers", action: "edit" },
  "POST /api/merchant/payment-providers/paymob/test": { module: "providers", action: "edit" },
  "POST /api/merchant/payment-providers/easycash": { module: "providers", action: "edit" },
  "GET /api/merchant/store": { module: "settings", action: "view" },
  "PATCH /api/merchant/store": { module: "settings", action: "edit" },
  "GET /api/merchant/coupons": { module: "checkout", action: "view" },
  "POST /api/merchant/coupons": { module: "checkout", action: "create" },
  "PATCH /api/merchant/coupons/:couponId": { module: "checkout", action: "edit" },
  "DELETE /api/merchant/coupons/:couponId": { module: "checkout", action: "delete" },
  "GET /api/merchant/accounting": { module: "accounting", action: "view" },
  "POST /api/merchant/accounting/discover": { module: "accounting", action: "edit" },
  "POST /api/merchant/accounting/test": { module: "accounting", action: "edit" },
  "PUT /api/merchant/accounting": { module: "accounting", action: "edit" },
  "POST /api/merchant/accounting/auto-link": { ownerOnly: true },
  "GET /api/merchant/android-builds": { module: "android", action: "view" },
  "POST /api/merchant/android-build": { module: "android", action: "create" },
  "GET /api/merchant/subscription-invoices": { module: "billing", action: "view" },
  "POST /api/merchant/subscription-invoices": { module: "billing", action: "create" },
  "POST /api/merchant/subscription-invoices/:invoiceId/pay": { module: "billing", action: "edit" },
  "GET /api/merchant/staff": { ownerOnly: true },
  "POST /api/merchant/staff": { ownerOnly: true },
  "PATCH /api/merchant/staff/:staffId": { ownerOnly: true },
  "DELETE /api/merchant/staff/:staffId": { ownerOnly: true },
  "POST /api/merchant/staff/:staffId/reset-password": { ownerOnly: true },
  "GET /api/merchant/permissions/my": { module: "dashboard", action: "view" },
  "GET /api/merchant/permissions/roles": { ownerOnly: true },
  "PUT /api/merchant/permissions/roles/:role": { ownerOnly: true },
  "GET /api/merchant/permissions/users/:userId/overrides": { ownerOnly: true },
  "PUT /api/merchant/permissions/users/:userId/overrides": { ownerOnly: true },
  "DELETE /api/merchant/permissions/users/:userId/overrides": { ownerOnly: true },
};

export async function enforceMerchantRoutePermission(
  pool: pg.Pool,
  request: FastifyRequest,
  requireMerchantUser: (request: FastifyRequest) => TenantAuthUser,
  requireMerchantOwner: (request: FastifyRequest) => TenantAuthUser,
) {
  const routeUrl = request.routeOptions?.url;
  if (!routeUrl?.startsWith("/api/merchant")) return;
  const key = `${request.method} ${routeUrl}`;
  const rule = MERCHANT_ROUTE_RULES[key];
  if (!rule) return;
  if ("ownerOnly" in rule) {
    requireMerchantOwner(request);
    return;
  }
  await requirePerm(pool, request, requireMerchantUser, rule.module, rule.action);
}
