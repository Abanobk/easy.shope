/** Easy Shope — modules + actions (aligned with Easy Cash permission model) */

export type PermissionAction = "view" | "create" | "edit" | "delete";

export type StaffRole = "store_manager" | "sales" | "fulfillment" | "marketing" | "viewer";

export type PermissionModule =
  | "dashboard"
  | "orders"
  | "products"
  | "categories"
  | "settings"
  | "themes"
  | "checkout"
  | "providers"
  | "billing"
  | "accounting"
  | "android"
  | "reviews";

export type ModulePermission = Record<PermissionAction, boolean>;

export type EffectivePermissions = Record<PermissionModule, ModulePermission>;

export const PERMISSION_ACTIONS: PermissionAction[] = ["view", "create", "edit", "delete"];

export const STAFF_ROLES: Array<{ id: StaffRole; labelAr: string; descriptionAr: string }> = [
  { id: "store_manager", labelAr: "مدير المتجر", descriptionAr: "إدارة شاملة للمتجر ما عدا الفريق والاشتراك" },
  { id: "sales", labelAr: "مبيعات", descriptionAr: "الطلبات والمنتجات والعملاء" },
  { id: "fulfillment", labelAr: "تجهيز وشحن", descriptionAr: "إدارة الطلبات والشحن" },
  { id: "marketing", labelAr: "تسويق", descriptionAr: "القوالب، الدفع والشحن، التقييمات" },
  { id: "viewer", labelAr: "عرض فقط", descriptionAr: "مشاهدة البيانات بدون تعديل" },
];

export const PERMISSION_MODULES: Array<{ id: PermissionModule; labelAr: string; group: string }> = [
  { id: "dashboard", labelAr: "نظرة عامة", group: "عام" },
  { id: "orders", labelAr: "الطلبات", group: "المبيعات" },
  { id: "products", labelAr: "المنتجات", group: "الكتالوج" },
  { id: "categories", labelAr: "الأصناف", group: "الكتالوج" },
  { id: "settings", labelAr: "بيانات المتجر", group: "المتجر" },
  { id: "themes", labelAr: "القوالب", group: "المتجر" },
  { id: "checkout", labelAr: "الدفع والشحن", group: "المتجر" },
  { id: "providers", labelAr: "مزودي الدفع", group: "الحساب" },
  { id: "billing", labelAr: "اشتراك المنصة", group: "الحساب" },
  { id: "accounting", labelAr: "المحاسبة (Easy Cash)", group: "الحساب" },
  { id: "android", labelAr: "تطبيق أندرويد", group: "الحساب" },
  { id: "reviews", labelAr: "تقييمات المنتجات", group: "المتجر" },
];

const ALL: ModulePermission = { view: true, create: true, edit: true, delete: true };
const VIEW_ONLY: ModulePermission = { view: true, create: false, edit: false, delete: false };
const VIEW_EDIT: ModulePermission = { view: true, create: false, edit: true, delete: false };
const VIEW_CREATE_EDIT: ModulePermission = { view: true, create: true, edit: true, delete: false };
const NONE: ModulePermission = { view: false, create: false, edit: false, delete: false };

function mod(overrides: Partial<Record<PermissionModule, ModulePermission>>): EffectivePermissions {
  const base = Object.fromEntries(PERMISSION_MODULES.map((m) => [m.id, { ...NONE }])) as EffectivePermissions;
  for (const [key, value] of Object.entries(overrides)) {
    base[key as PermissionModule] = { ...value! };
  }
  return base;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, EffectivePermissions> = {
  store_manager: mod(
    Object.fromEntries(PERMISSION_MODULES.map((m) => [m.id, m.id === "billing" ? VIEW_ONLY : ALL])) as Partial<
      Record<PermissionModule, ModulePermission>
    >,
  ),
  sales: mod({
    dashboard: VIEW_ONLY,
    orders: ALL,
    products: VIEW_CREATE_EDIT,
    categories: VIEW_ONLY,
    settings: VIEW_ONLY,
    themes: VIEW_ONLY,
    checkout: VIEW_ONLY,
    providers: NONE,
    billing: NONE,
    accounting: NONE,
    android: NONE,
    reviews: VIEW_ONLY,
  }),
  fulfillment: mod({
    dashboard: VIEW_ONLY,
    orders: ALL,
    products: VIEW_ONLY,
    categories: VIEW_ONLY,
    settings: NONE,
    themes: NONE,
    checkout: NONE,
    providers: NONE,
    billing: NONE,
    accounting: NONE,
    android: NONE,
    reviews: NONE,
  }),
  marketing: mod({
    dashboard: VIEW_ONLY,
    orders: VIEW_ONLY,
    products: VIEW_ONLY,
    categories: VIEW_ONLY,
    settings: VIEW_EDIT,
    themes: ALL,
    checkout: ALL,
    providers: VIEW_ONLY,
    billing: NONE,
    accounting: NONE,
    android: VIEW_ONLY,
    reviews: ALL,
  }),
  viewer: mod(
    Object.fromEntries(PERMISSION_MODULES.map((m) => [m.id, VIEW_ONLY])) as Partial<Record<PermissionModule, ModulePermission>>,
  ),
};

/** Owner-equivalent permissions for merchant_owner */
export function ownerPermissions(): EffectivePermissions {
  return mod(Object.fromEntries(PERMISSION_MODULES.map((m) => [m.id, ALL])) as Partial<Record<PermissionModule, ModulePermission>>);
}

export function emptyPermissions(): EffectivePermissions {
  return mod({});
}

export function hasPermission(perms: EffectivePermissions, module: PermissionModule, action: PermissionAction): boolean {
  const row = perms[module];
  if (!row) return false;
  if (action === "view") return row.view;
  if (action === "create") return row.create;
  if (action === "edit") return row.edit;
  return row.delete;
}

/** Map legacy flat permission keys (phase 1) to module grants */
const LEGACY_KEY_TO_MODULE: Record<string, PermissionModule> = {
  orders: "orders",
  products: "products",
  categories: "categories",
  settings: "settings",
  providers: "providers",
  billing: "billing",
  accounting: "accounting",
  android: "android",
  checkout: "checkout",
  themes: "themes",
  reviews: "reviews",
};

export function legacyFlatPermissionsToEffective(flat: string[]): EffectivePermissions {
  const result = emptyPermissions();
  for (const key of flat) {
    const module = LEGACY_KEY_TO_MODULE[key];
    if (!module) continue;
    result[module] = { view: true, create: true, edit: true, delete: key === "orders" || key === "products" || key === "categories" };
  }
  return result;
}

export function flattenEffectiveToLegacyKeys(perms: EffectivePermissions): string[] {
  const keys: string[] = [];
  for (const [legacy, module] of Object.entries(LEGACY_KEY_TO_MODULE)) {
    if (hasPermission(perms, module, "view")) keys.push(legacy);
  }
  return keys;
}

export function moduleForMerchantSubTab(subTab: string): PermissionModule | null {
  const map: Record<string, PermissionModule> = {
    overview: "dashboard",
    products: "products",
    categories: "categories",
    orders: "orders",
    settings: "settings",
    themes: "themes",
    checkout: "checkout",
    providers: "providers",
    billing: "billing",
    accounting: "accounting",
    android: "android",
  };
  return map[subTab] ?? null;
}

export function moduleForMerchantMainTab(mainTab: string): PermissionModule | null {
  const map: Record<string, PermissionModule> = {
    overview: "dashboard",
    catalog: "products",
    orders: "orders",
    store: "settings",
    account: "providers",
  };
  return map[mainTab] ?? null;
}
