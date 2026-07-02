const state = {
  token: localStorage.getItem("easyShopeToken") || "",
  tenantSlug: localStorage.getItem("easyShopeTenantSlug") || "",
  role: localStorage.getItem("easyShopeRole") || "",
  customerToken: localStorage.getItem("easyShopeCustomerToken") || "",
  /** uuid tenant لصفحة المتجر الحالية (للتحقق من دخول العميل) */
  storeTenantId: "",
  cart: [],
  storefrontCategory: "",
  merchantCategories: [],
  merchantProducts: [],
  merchantOrders: [],
  merchantAndroidBuilds: [],
  androidIntegration: null,
  storefrontThemeDraft: "ocean",
  /** آخر قالب محفوظ على الخادم (للمقارنة مع المعاينة) */
  savedStorefrontTheme: "ocean",
  adminTenants: [],
  adminPlans: [],
  merchantPlans: [],
  /** صلاحيات المستخدم الحالي */
  permissions: [],
  effectivePermissions: {},
  permissionsBypass: false,
  staffRole: null,
  merchantMainTab: "overview",
  merchantPanel: "overview",
};

/// وحدات الصلاحيات (تُحمّل من API أيضاً)
const PERMISSION_ACTION_LABELS = { view: "عرض", create: "إضافة", edit: "تعديل", delete: "حذف" };

function can(module, action = "view") {
  if (state.permissionsBypass || state.role === "merchant_owner") return true;
  const row = state.effectivePermissions?.[module];
  if (!row) return false;
  return Boolean(row[action]);
}

function merchantMainTabAllowed(mainTab) {
  if (state.role === "merchant_owner" || state.permissionsBypass) return true;
  if (mainTab === "overview") return can("dashboard", "view");
  if (mainTab === "catalog") return can("products", "view") || can("categories", "view");
  if (mainTab === "orders") return can("orders", "view");
  if (mainTab === "store") return can("settings", "view") || can("themes", "view") || can("checkout", "view");
  if (mainTab === "account") {
    return can("providers", "view") || can("billing", "view") || can("accounting", "view") || can("android", "view");
  }
  return false;
}

function merchantSubTabAllowed(subTab) {
  if (state.role === "merchant_owner" || state.permissionsBypass) {
    if (subTab === "team") return state.role === "merchant_owner";
    return true;
  }
  if (subTab === "team") return false;
  if (subTab === "products") return can("products", "view");
  if (subTab === "categories") return can("categories", "view");
  if (subTab === "orders") return can("orders", "view");
  if (subTab === "settings") return can("settings", "view");
  if (subTab === "themes") return can("themes", "view");
  if (subTab === "checkout") return can("checkout", "view");
  if (subTab === "providers") return can("providers", "view");
  if (subTab === "billing") return can("billing", "view");
  if (subTab === "accounting") return can("accounting", "view");
  if (subTab === "android") return can("android", "view");
  if (subTab === "overview") return can("dashboard", "view");
  return false;
}

const STOREFRONT_THEME_LABELS = {
  ocean: "Ocean — أزياء كلاسيكية (شبكة + شريط سفلي)",
  violet: "Violet — تجميل (قصص + بطاقات)",
  emerald: "Emerald — إلكترونيات (قائمة + سلة)",
  amber: "Amber — مطعم (بانر + عروض)",
  rose: "Rose — منزل وديكور (معرض + شبكة)",
  slate: "Slate — إبداعي (minimal)",
};

const MERCHANT_TAB_LABELS = {
  overview: "نظرة عامة",
  catalog: "الكتالوج",
  orders: "الطلبات",
  store: "المتجر",
  account: "الحساب",
  products: "المنتجات",
  categories: "الأصناف",
  billing: "اشتراك المنصة",
  accounting: "المحاسبة",
  providers: "إعدادات الدفع",
  team: "الفريق",
  android: "تطبيق أندرويد",
  settings: "بيانات المتجر",
  themes: "استوديو القوالب",
};

/** Maps legacy/sub tab ids → main nav + active panel (Phase 2 grouping). */
const MERCHANT_TAB_ROUTES = {
  overview: { main: "overview", panel: "overview" },
  catalog: { main: "catalog", panel: "products" },
  orders: { main: "orders", panel: "orders" },
  store: { main: "store", panel: "settings" },
  account: { main: "account", panel: "billing" },
  products: { main: "catalog", panel: "products" },
  categories: { main: "catalog", panel: "categories" },
  settings: { main: "store", panel: "settings" },
  checkout: { main: "store", panel: "checkout" },
  themes: { main: "store", panel: "themes" },
  billing: { main: "account", panel: "billing" },
  accounting: { main: "account", panel: "accounting" },
  providers: { main: "account", panel: "providers" },
  team: { main: "account", panel: "team" },
  android: { main: "account", panel: "android" },
};

const MERCHANT_MAIN_TABS = ["overview", "catalog", "orders", "store", "account"];

const ADMIN_TAB_LABELS = {
  overview: "نظرة عامة",
  tenants: "التجار",
  subscriptions: "الاشتراكات",
  orders: "طلبات المنصة",
  system: "النظام",
};

const STOREFRONT_CHROME_HINTS = {
  ocean: "أزياء وإكسسوارات · شبكة منتجات",
  violet: "تجميل وعناية · قصص وبطاقات",
  emerald: "إلكترونيات وتقنية",
  amber: "مطعم ومأكولات · قائمة يومية",
  rose: "منزل وديكور · معرض صور",
  slate: "إبداعي · قائمة بسيطة",
};

/** Arabic labels + semantic class for order/payment/product statuses. */
const STATUS_LABELS = {
  active: "نشط",
  disabled: "معطّل",
  published: "منشور",
  draft: "مسودة",
  paid: "مدفوع",
  pending: "معلق",
  failed: "فشل",
  cancelled: "ملغي",
  canceled: "ملغي",
  processing: "قيد المعالجة",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  succeeded: "نجح",
  running: "قيد التنفيذ",
  queued: "في الانتظار",
  trial: "تجريبي",
  expired: "منتهي",
  suspended: "موقوف",
};

function statusBadge(status, { type } = {}) {
  const key = String(status || "").toLowerCase();
  const label = STATUS_LABELS[key] || status || "—";
  const ok = new Set(["active", "paid", "published", "succeeded", "delivered", "shipped"]);
  const warn = new Set(["pending", "draft", "processing", "running", "queued", "trial"]);
  let cls = "off";
  if (ok.has(key)) cls = "ok";
  else if (warn.has(key)) cls = "warn";
  if (type === "enabled") cls = status ? "ok" : "off";
  return `<span class="status-badge ${cls}">${type === "enabled" ? (status ? "مفعّل" : "غير مفعّل") : label}</span>`;
}

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function copyTextToClipboard(text) {
  if (!text) return Promise.reject(new Error("لا يوجد نص للنسخ"));
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

function paymobStatusIcon(ok, warn) {
  if (ok) return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
  if (warn) return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 4h3.4L22 20H2L10.3 4z"/></svg>`;
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
}

function paymobStatusRow(ok, warn, label, value) {
  return `<div class="paymob-status-row"><span class="ps-label">${paymobStatusIcon(ok, warn)} ${label}</span><span class="ps-value">${value || "—"}</span></div>`;
}

function renderPaymobStatusPanel(containerId, paymob, { scope = "platform" } = {}) {
  const el = $(containerId);
  if (!el) return;
  const cfg = paymob?.public_config || {};
  const cardId = cfg.cardIntegrationId;
  const walletId = cfg.walletIntegrationId;
  const hasKey = Boolean(cfg.publicKeyLast8);
  const configured = Boolean(paymob);
  const cardOk = Boolean(cardId);
  const ready = configured && hasKey && cardOk && paymob.is_enabled;
  const cardClass = ready ? "is-ready" : configured ? "is-pending" : "";
  const title = ready ? "Paymob جاهز — الدفع مفعّل" : configured ? "Paymob محفوظ — أكمل الإعداد" : "Paymob غير مربوط";
  const subtitle = ready
    ? "لا حاجة لإعادة إدخال المفاتيح. يمكنك «اختبار الاتصال» أو تعديل المفاتيح عند الحاجة."
    : configured
      ? "أكمل رقم تكامل البطاقة وفعّل Paymob، ثم اختبر الاتصال."
      : scope === "platform"
        ? "اربط حساب Paymob لتفعيل الدفع المباشر عند اختيار التاجر لخطة مدفوعة."
        : "اربط حساب Paymob لاستقبال مدفوعات عملاء متجرك عند الشراء.";

  el.innerHTML = `<div class="paymob-status-card ${cardClass}">
    <div class="paymob-status-head">
      <div><h3>${title}</h3><p class="muted" style="margin:6px 0 0;font-size:0.88rem">${subtitle}</p></div>
      ${statusBadge(paymob?.is_enabled ? "active" : "disabled", { type: "enabled" })}
    </div>
    <div class="paymob-status-rows">
      ${paymobStatusRow(configured, !configured, "الإعداد", configured ? "محفوظ" : "غير مضاف")}
      ${paymobStatusRow(hasKey, configured && !hasKey, "Public Key", hasKey ? `…${cfg.publicKeyLast8}` : "مطلوب")}
      ${paymobStatusRow(cardOk, configured && !cardOk, "تكامل البطاقة", cardId || "مطلوب")}
      ${paymobStatusRow(Boolean(walletId), false, "تكامل المحفظة", walletId ? String(walletId) : "اختياري")}
      ${paymobStatusRow(Boolean(paymob?.mode), false, "الوضع", paymob?.mode || "—")}
    </div>
    <table class="paymob-methods-table" aria-label="طرق الدفع">
      <thead><tr><th>الطريقة</th><th>رقم التكامل</th><th>الحالة</th></tr></thead>
      <tbody>
        <tr><td>بطاقة (Unified Checkout)</td><td dir="ltr">${cardId || "—"}</td><td>${statusBadge(cardOk ? "active" : "disabled", { type: "enabled" })}</td></tr>
        <tr><td>محفظة</td><td dir="ltr">${walletId || "—"}</td><td>${statusBadge(walletId ? "active" : "disabled", { type: "enabled" })}</td></tr>
      </tbody>
    </table>
  </div>`;
}

function renderShopWelcomeBanner(store) {
  const now = new Date();
  const dayEl = $("shop-welcome-day");
  const monthEl = $("shop-welcome-month");
  const titleEl = $("shop-welcome-title");
  if (dayEl) dayEl.textContent = String(now.getDate());
  if (monthEl) monthEl.textContent = `${AR_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  if (titleEl && store?.name_ar) titleEl.textContent = `مرحباً — ${store.name_ar}`;
}

function renderSubscriptionPlanCards(plans, selectedCode) {
  const grid = $("subscription-plans-grid");
  const hidden = $("planCode");
  const btn = $("subscription-create-btn");
  if (!grid) return;
  const activePlans = (plans || []).filter((p) => p.is_active !== false);
  if (!activePlans.length) {
    grid.innerHTML = `<div class="empty-state"><strong>لا توجد خطط متاحة</strong><p>تواصل مع إدارة المنصة لتفعيل خطط الاشتراك.</p></div>`;
    if (hidden) hidden.value = "";
    if (btn) btn.disabled = true;
    return;
  }
  const current = selectedCode || hidden?.value || activePlans[0].code;
  if (hidden) hidden.value = current;
  if (btn) btn.disabled = !current;
  grid.innerHTML = activePlans
    .map(
      (plan) => `<button type="button" class="plan-picker-card${plan.code === current ? " selected" : ""}" data-plan-code="${plan.code}" role="option" aria-selected="${plan.code === current}">
        <strong>${escapeHtmlText(plan.name)}</strong>
        <div class="plan-price">${money(plan.price_cents)}</div>
        <small>${plan.duration_months || 1} شهر · ${plan.code === current ? "مختارة" : "اضغط للاختيار"}</small>
      </button>`,
    )
    .join("");
  grid.querySelectorAll("[data-plan-code]").forEach((card) => {
    card.addEventListener("click", () => {
      grid.querySelectorAll(".plan-picker-card").forEach((c) => {
        c.classList.toggle("selected", c.dataset.planCode === card.dataset.planCode);
        c.setAttribute("aria-selected", c.dataset.planCode === card.dataset.planCode ? "true" : "false");
      });
      if (hidden) hidden.value = card.dataset.planCode;
      if (btn) btn.disabled = false;
    });
  });
}

function openAppModal({ title, bodyHtml, footHtml }) {
  const dlg = $("app-modal");
  if (!dlg) return;
  const titleEl = $("app-modal-title");
  const bodyEl = $("app-modal-body");
  const footEl = $("app-modal-foot");
  if (titleEl) titleEl.textContent = title || "";
  if (bodyEl) bodyEl.innerHTML = bodyHtml || "";
  if (footEl) {
    if (footHtml) {
      footEl.innerHTML = footHtml;
      footEl.hidden = false;
    } else {
      footEl.innerHTML = "";
      footEl.hidden = true;
    }
  }
  if (typeof dlg.showModal === "function") dlg.showModal();
}

function closeAppModal() {
  const dlg = $("app-modal");
  if (dlg && typeof dlg.close === "function") dlg.close();
}

function emptyStateBlock({ title, hint, actionLabel, actionId }) {
  const action = actionLabel && actionId ? `<button type="button" class="mini-cta" id="${actionId}">${actionLabel}</button>` : "";
  return `<div class="empty-state" role="status">
    <div class="empty-state-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 5v14M5 12h14"/></svg>
    </div>
    <strong>${title}</strong>
    <p class="muted">${hint}</p>
    ${action}
  </div>`;
}

function updateMerchantSubnavs(mainTab) {
  $("subnav-catalog")?.toggleAttribute("hidden", mainTab !== "catalog");
  $("subnav-store")?.toggleAttribute("hidden", mainTab !== "store");
  $("subnav-account")?.toggleAttribute("hidden", mainTab !== "account");
}

function firstAllowedMerchantPanel(mainTab) {
  const defaults = {
    catalog: ["products", "categories"],
    store: ["settings", "themes"],
    account: ["billing", "accounting", "providers", "team", "android"],
  };
  const candidates = defaults[mainTab];
  if (!candidates) return mainTab;
  return candidates.find((sub) => merchantSubTabAllowed(sub)) || candidates[0];
}

let storefrontSearchTimer = null;

function getStoreSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("store")) return (params.get("store") || "").trim();
  const trackMatch = window.location.pathname.match(/^\/store\/([^/]+)\/track\//);
  if (trackMatch?.[1]) return decodeURIComponent(trackMatch[1]).trim();
  const match = window.location.pathname.match(/^\/store\/([^\/?#]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]).trim();
  if (window.location.hash.startsWith("#store/")) {
    return window.location.hash.slice("#store/".length).split(/[?&#/]/)[0].trim();
  }
  return "";
}

function getTrackTokenFromUrl() {
  const match = window.location.pathname.match(/^\/store\/[^/]+\/track\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]).trim() : "";
}

const ORDER_STATUS_LABELS = {
  pending: "قيد الانتظار",
  confirmed: "مؤكد",
  processing: "قيد التجهيز",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[String(status || "").toLowerCase()] || status || "-";
}

function isStoreClientMode() {
  return Boolean(getStoreSlugFromUrl()) || new URLSearchParams(window.location.search).get("app") === "1";
}

function storeClientTagline(store, categories) {
  const names = categories.slice(0, 3).map((c) => c.name_ar).filter(Boolean);
  if (names.length) return names.join(" · ");
  if (store?.country) return `تسوق من ${store.country}`;
  return "تسوّق بسهولة وأمان";
}

function applyStoreClientShell() {
  if (!isStoreClientMode()) return;
  document.body.classList.add("store-client-mode");
  document.documentElement.classList.add("store-client-shell");
  document.body.dataset.scope = "customer";
  document.body.dataset.view = "storefront";
  const slugField = $("tenant-slug");
  if (slugField) slugField.classList.add("mobile-store-slug-hidden");
  const formBtn = $("storefront-search-btn");
  if (formBtn) formBtn.textContent = "بحث";
  const merchantHero = document.querySelector(".store-hero-merchant-block");
  const clientHero = $("store-hero-client-block");
  if (merchantHero) merchantHero.hidden = true;
  if (clientHero) clientHero.hidden = false;
  const cartFab = $("store-cart-fab");
  if (cartFab) cartFab.hidden = true;
  const productsHead = $("store-products-head");
  if (productsHead) productsHead.hidden = false;
  hideTrialBanner();
  updateWhatsAppFab();
}

function setStoreCartOpen(open) {
  document.body.classList.toggle("store-cart-open", open);
  const backdrop = $("store-cart-backdrop");
  if (backdrop) {
    backdrop.hidden = !open;
    backdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }
  if (open) setStoreAccountOpen(false);
}

function setStoreAccountOpen(open) {
  document.body.classList.toggle("store-account-open", open);
  const panel = $("store-account-panel");
  const backdrop = $("store-account-backdrop");
  if (panel) panel.hidden = !open;
  if (backdrop) {
    backdrop.hidden = !open;
    backdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }
  if (open) setStoreCartOpen(false);
}

function categorySliderImage(category) {
  return category.image_url || category.sample_product_image || "";
}

function renderStoreCategorySlider(categories) {
  const el = $("store-category-slider");
  if (!el || !isStoreClientMode()) {
    if (el) {
      el.hidden = true;
      el.innerHTML = "";
    }
    return;
  }
  const active = state.storefrontCategory ?? "";
  const allBtn = `<button type="button" class="store-category-card${active === "" ? " is-active" : ""}" data-store-category="">
    <span class="store-category-card-media"><span class="store-category-card-fallback">★</span></span>
    <span class="store-category-card-label">الكل</span>
  </button>`;
  const items = categories.map((c) => {
    const img = categorySliderImage(c);
    const media = img
      ? `<img src="${img}" alt="" loading="lazy">`
      : `<span class="store-category-card-fallback">${(c.name_ar || "?").slice(0, 1)}</span>`;
    return `<button type="button" class="store-category-card${active === c.slug ? " is-active" : ""}" data-store-category="${c.slug}">
      <span class="store-category-card-media">${media}</span>
      <span class="store-category-card-label">${c.name_ar}</span>
    </button>`;
  });
  el.hidden = false;
  el.innerHTML = `<div class="store-category-slider-track">${allBtn}${items.join("")}</div>`;
}

function storefrontClientProductHtml(item) {
  const letter = (item.title_ar || "?").slice(0, 1);
  const imgInner = item.image_url
    ? `<img src="${item.image_url}" alt="${item.title_ar}" loading="lazy">`
    : `<span class="store-client-product-fallback">${letter}</span>`;
  const title = item.title_ar;
  const price = productPriceHtml(item);
  return `<article class="store-client-product-card">
    <button type="button" class="store-client-product-tap" data-view-product="${item.slug}" aria-label="${title}">
      <div class="store-client-product-media">${imgInner}</div>
    </button>
    <div class="store-client-product-body">
      <h3>${title}</h3>
      <div class="store-client-product-meta">${price}</div>
      <button type="button" class="store-client-add-btn success-button" data-add-cart="${item.id}" data-title="${title}" data-price="${effectivePriceCents(item)}">أضف للسلة</button>
    </div>
  </article>`;
}

function isMobileDashboard() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function syncDashboardLayoutMode() {
  const mobile = isMobileDashboard();
  document.documentElement.classList.toggle("dashboard-mobile", mobile);
  document.body.classList.toggle("dashboard-mobile", mobile);
  if (!mobile) {
    closeMerchantNav();
    closeAdminNav();
  }
}

function setMerchantNavOpen(open) {
  document.body.classList.toggle("merchant-nav-open", open);
  const toggle = $("merchant-menu-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  const backdrop = $("merchant-nav-backdrop");
  if (backdrop) backdrop.setAttribute("aria-hidden", open ? "false" : "true");
}

function closeMerchantNav() {
  setMerchantNavOpen(false);
}

function setAdminNavOpen(open) {
  document.body.classList.toggle("admin-nav-open", open);
  const toggle = $("admin-menu-toggle");
  if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  const backdrop = $("admin-nav-backdrop");
  if (backdrop) backdrop.setAttribute("aria-hidden", open ? "false" : "true");
}

function closeAdminNav() {
  setAdminNavOpen(false);
}

function updateMerchantMobileChrome(route = { main: "overview", panel: "overview" }) {
  const title = $("merchant-mobile-tab-title");
  const subLabel = MERCHANT_TAB_LABELS[route.panel];
  const mainLabel = MERCHANT_TAB_LABELS[route.main] || route.main;
  if (title) {
    title.textContent = route.main === route.panel || MERCHANT_MAIN_TABS.includes(route.panel)
      ? mainLabel
      : `${mainLabel} · ${subLabel}`;
  }
  const storeName = $("merchant-mobile-store-name");
  const brandName = $("merchant-brand-name");
  if (storeName) storeName.textContent = brandName?.textContent?.trim() || "لوحة المتجر";
}

function updateAdminMobileChrome(tab = "overview") {
  const title = $("admin-mobile-tab-title");
  if (title) title.textContent = ADMIN_TAB_LABELS[tab] || tab;
}

function initDashboardMobileNav() {
  syncDashboardLayoutMode();
  $("merchant-menu-toggle")?.addEventListener("click", () => {
    setMerchantNavOpen(!document.body.classList.contains("merchant-nav-open"));
  });
  $("merchant-nav-backdrop")?.addEventListener("click", closeMerchantNav);
  $("merchant-drawer-close")?.addEventListener("click", closeMerchantNav);
  $("admin-menu-toggle")?.addEventListener("click", () => {
    setAdminNavOpen(!document.body.classList.contains("admin-nav-open"));
  });
  $("admin-nav-backdrop")?.addEventListener("click", closeAdminNav);
  $("admin-drawer-close")?.addEventListener("click", closeAdminNav);
  window.addEventListener("resize", syncDashboardLayoutMode);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMerchantNav();
    closeAdminNav();
  });
}

const $ = (id) => document.getElementById(id);

function money(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2)} EGP`;
}

function sumRows(rows, key = "count") {
  return (rows || []).reduce((total, row) => total + Number(row[key] || 0), 0);
}

function statusCount(rows, status) {
  return Number((rows || []).find((row) => row.status === status)?.count || 0);
}

function queryString(params) {
  const entries = Object.entries(params).filter(([, value]) => value);
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function compressImageToDataUrl(file, { maxSize = 1100, quality = 0.78 } = {}) {
  if (!file || !file.size) return "";
  if (file.size > 8 * 1024 * 1024) throw new Error("حجم الصورة كبير. استخدم صورة أقل من 8MB.");
  const blobUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = blobUrl;
    await new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("تعذر قراءة الصورة."));
    });
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذر تجهيز معالجة الصورة.");
    ctx.drawImage(image, 0, 0, width, height);
    await sleep(0); // yield so UI can update
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function fileToDataUrl(file) {
  if (!file || !file.size) return "";
  const type = String(file.type || "");
  if (type.startsWith("image/")) return await compressImageToDataUrl(file);
  // For now, avoid heavy video/base64 uploads
  throw new Error("رفع هذا النوع من الملفات غير مدعوم حاليًا. استخدم رابط فيديو فقط.");
}

function setCreationForm(formId, visible) {
  const form = $(formId);
  if (!form) return;
  form.hidden = !visible;
  form.classList.toggle("hidden", !visible);
  const panel = form.closest(".panel");
  panel?.classList.toggle("panel-mode-add", visible);
  panel?.classList.toggle("panel-mode-list", !visible);
  panel?.querySelector(".list-mode")?.toggleAttribute("hidden", visible);
  if (visible) {
    form.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

function parseMoneyToCents(value) {
  return Math.round(Number(value || 0) * 100);
}

function productPriceHtml(product) {
  const compareAt = Number(product.compare_at_price_cents || 0);
  const discount = Number(product.discount_percent || 0);
  return `<code>${money(product.price_cents)}</code>${compareAt ? `<small class="old-price">${money(compareAt)}</small>` : ""}${discount ? `<small class="discount-badge">خصم ${discount}%</small>` : ""}`;
}

const STOREFRONT_LAYOUTS = new Set(["ocean", "violet", "emerald", "amber", "rose", "slate"]);

function normalizeStorefrontLayout(theme) {
  return STOREFRONT_LAYOUTS.has(theme) ? theme : "ocean";
}

function storefrontCategoryControlsHtml(categories, mode, options = {}) {
  const active = state.storefrontCategory ?? "";
  const extra = mode === "tabs" ? "storefront-tab" : mode === "rail" ? "storefront-rail-btn" : "";
  const row = (slug, label, isOn) => {
    const cls = [isOn ? "active" : "", extra].filter(Boolean).join(" ").trim();
    return `<button type="button" class="${cls}" data-store-category="${slug}">${label}</button>`;
  };
  const labelFor = (c) => (options.hideCounts ? c.name_ar : `${c.name_ar} (${c.products_count})`);
  return [
    row("", "الكل", active === ""),
    ...categories.map((c) => row(c.slug, labelFor(c), active === c.slug)),
  ].join("");
}

function renderStorefrontChrome(layout, store, categories) {
  const bar = $("storefront-chrome-bar");
  const rail = $("storefront-category-rail");
  const bottom = $("storefront-bottom-nav");
  const pills = $("storefront-categories");
  if (!bar || !rail || !bottom || !pills) return;

  const clientMode = isStoreClientMode();
  const catOpts = clientMode ? { hideCounts: true } : {};
  const name = store.name_ar || store.name_en || "المتجر";
  const tagline = clientMode ? storeClientTagline(store, categories) : STOREFRONT_CHROME_HINTS[layout] || "";
  const logoHtml = store.logo_url
    ? `<img src="${store.logo_url}" alt="" class="storefront-chrome-logo" loading="lazy">`
    : `<span class="storefront-chrome-dot" aria-hidden="true"></span>`;
  const catTabs = storefrontCategoryControlsHtml(categories, "tabs", catOpts);
  const catRail = storefrontCategoryControlsHtml(categories, "rail", catOpts);
  const catPills = storefrontCategoryControlsHtml(categories, "pills", catOpts);

  bar.hidden = false;
  rail.hidden = layout !== "amber";
  bottom.hidden = layout !== "emerald";

  if (layout === "ocean") {
    bar.innerHTML = `<div class="storefront-chrome-inner storefront-chrome--ocean"><div class="storefront-chrome-brand">${logoHtml}<div><strong>${name}</strong><small>${tagline}</small></div></div><div id="storefront-chrome-tabs" class="storefront-chrome-tabs">${catTabs}</div></div>`;
    rail.innerHTML = "";
    bottom.innerHTML = "";
    pills.innerHTML = "";
    pills.hidden = true;
  } else if (layout === "violet") {
    bar.innerHTML = `<div class="storefront-chrome-inner storefront-chrome--violet"><div class="storefront-chrome-brand">${clientMode ? logoHtml : ""}<div><strong>${name}</strong><small>${tagline}</small></div></div>${clientMode ? "" : '<span class="storefront-chrome-pill">Beauty</span>'}</div>`;
    rail.innerHTML = "";
    bottom.innerHTML = "";
    pills.innerHTML = catPills;
    pills.hidden = false;
  } else if (layout === "emerald") {
    bar.innerHTML = `<div class="storefront-chrome-inner storefront-chrome--emerald"><div class="storefront-chrome-brand">${logoHtml}<div><strong>${name}</strong><small>${tagline}</small></div></div>${clientMode ? "" : '<span class="storefront-chrome-chip">Tech hub</span>'}</div>`;
    rail.innerHTML = "";
    bottom.innerHTML = `<div class="storefront-bottom-nav-inner">
      <button type="button" class="storefront-nav-item is-active" data-store-nav="home"><span class="storefront-nav-ic" aria-hidden="true">⌂</span><small>الرئيسية</small></button>
      <button type="button" class="storefront-nav-item" data-store-nav="cats"><span class="storefront-nav-ic" aria-hidden="true">≡</span><small>الأقسام</small></button>
      <button type="button" class="storefront-nav-item" data-store-nav="cart"><span class="storefront-nav-ic" aria-hidden="true">◆</span><small>السلة</small></button>
      <button type="button" class="storefront-nav-item" data-store-nav="account"><span class="storefront-nav-ic" aria-hidden="true">◎</span><small>حسابي</small></button>
    </div>`;
    pills.innerHTML = catPills;
    pills.hidden = false;
  } else if (layout === "amber") {
    bar.innerHTML = `<div class="storefront-chrome-inner storefront-chrome--amber"><div class="storefront-chrome-brand">${logoHtml}<div><strong>${name}</strong><small>${tagline}</small></div></div>${clientMode ? '<span class="storefront-delivery-badge">توصيل متاح</span>' : '<span class="storefront-delivery-badge">توصيل متاح</span>'}</div>`;
    rail.innerHTML = `<div class="storefront-rail-inner"><div class="storefront-rail-title">القائمة</div><div class="storefront-rail-list">${catRail}</div></div>`;
    bottom.innerHTML = "";
    pills.innerHTML = "";
    pills.hidden = true;
  } else if (layout === "rose") {
    bar.innerHTML = `<div class="storefront-chrome-inner storefront-chrome--rose"><div class="storefront-chrome-brand">${logoHtml}<div><strong>${name}</strong><small>${tagline}</small></div></div></div>`;
    rail.innerHTML = "";
    bottom.innerHTML = "";
    pills.innerHTML = catPills;
    pills.hidden = false;
  } else if (layout === "slate") {
    bar.innerHTML = `<div class="storefront-chrome--slate-wrap"><div class="storefront-chrome-art" aria-hidden="true"></div><div class="storefront-chrome-inner storefront-chrome--slate"><div class="storefront-chrome-brand">${logoHtml}<div><strong>${name}</strong><small>${tagline}</small></div></div></div></div>`;
    rail.innerHTML = "";
    bottom.innerHTML = "";
    pills.innerHTML = catPills;
    pills.hidden = false;
  } else {
    bar.hidden = true;
    rail.hidden = true;
    bottom.hidden = true;
    rail.innerHTML = "";
    bottom.innerHTML = "";
    pills.innerHTML = catPills;
    pills.hidden = false;
  }
}

function storefrontProductHtml(item, layout) {
  const letter = item.title_ar.slice(0, 1);
  const imgInner = item.image_url
    ? `<img src="${item.image_url}" alt="" loading="lazy">`
    : `<span>${letter}</span>`;
  const title = item.title_ar;
  const desc = item.description || "منتج متاح في المتجر.";
  const price = productPriceHtml(item);
  const addLabel = layout === "amber" ? "اطلب الآن" : "أضف للسلة";
  const actions = `<div class="store-product-actions">
    <button type="button" data-view-product="${item.slug}">تفاصيل</button>
    <button type="button" class="success-button" data-add-cart="${item.id}" data-title="${title}" data-price="${effectivePriceCents(item)}">${addLabel}</button>
  </div>`;

  if (layout === "violet") {
    return `<article class="store-product-card store-product-card--violet">
      <div class="store-product-media">${imgInner}</div>
      <div class="store-product-body">
        <h3>${title}</h3>
        <p>${desc}</p>
        <div class="store-product-meta">${price}</div>
        ${actions}
      </div>
    </article>`;
  }
  if (layout === "emerald") {
    return `<article class="store-product-card store-product-card--emerald">
      <div class="store-product-thumb">${imgInner}</div>
      <div class="store-product-body">
        <h3>${title}</h3>
        <p class="store-product-desc">${desc}</p>
        <div class="store-product-meta">${price}</div>
        ${actions}
      </div>
    </article>`;
  }
  if (layout === "amber") {
    return `<article class="store-product-card store-product-card--amber">
      <div class="store-product-media">${imgInner}</div>
      <div class="store-product-body">
        <h3>${title}</h3>
        <p>${desc}</p>
        <div class="store-product-meta">${price}</div>
        ${actions}
      </div>
    </article>`;
  }
  if (layout === "rose") {
    return `<article class="store-product-card store-product-card--rose">
      <div class="store-product-media">${imgInner}</div>
      <div class="store-product-body">
        <h3>${title}</h3>
        <p>${desc}</p>
        <div class="store-product-meta">${price}</div>
        ${actions}
      </div>
    </article>`;
  }
  if (layout === "slate") {
    return `<article class="store-product-card store-product-card--slate">
      <div class="store-product-media">${imgInner}</div>
      <div class="store-product-body">
        <h3>${title}</h3>
        <p class="store-product-desc">${desc}</p>
        <div class="store-product-meta">${price}</div>
        ${actions}
      </div>
    </article>`;
  }
  return `<article class="store-product-card store-product-card--ocean">
    <div class="store-product-media">${imgInner}</div>
    <div class="store-product-body">
      <h3>${title}</h3>
      <p>${desc}</p>
      <div class="store-product-meta">${price}</div>
      ${actions}
    </div>
  </article>`;
}

function renderStorefrontStories(categories, layout) {
  const el = $("storefront-stories");
  if (!el) return;
  if (layout !== "violet" || !categories.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  const active = state.storefrontCategory || "";
  const items = categories.slice(0, 10).map(
    (c) =>
      `<button type="button" class="storefront-story${active && active === c.slug ? " is-active" : ""}" data-store-category="${c.slug}">
        <span class="storefront-story-avatar">${(c.name_ar || "?").slice(0, 1)}</span>
        <span class="storefront-story-label">${c.name_ar}</span>
      </button>`,
  );
  el.innerHTML = `<div class="storefront-stories-track">${items.join("")}</div>`;
}

function renderStorefrontSpotlight(store, products, layout) {
  const el = $("storefront-spotlight");
  if (!el) return;
  const first = products[0];
  const img = first?.image_url || "";
  if (layout === "amber") {
    el.hidden = false;
    const bg = img ? ` style="--spotlight-img:url('${img}')"` : "";
    el.innerHTML = `<div class="storefront-spotlight-inner storefront-spotlight--amber"${bg}>
      <div class="storefront-spotlight-copy">
        <span class="storefront-spotlight-kicker">قائمة اليوم · توصيل متاح</span>
        <strong>${store.name_ar || "تسوق الآن"}</strong>
        <p>تصفّح الأصناف من القائمة الجانبية واختر وجبتك المفضلة.</p>
      </div>
    </div>`;
    return;
  }
  if (layout === "rose") {
    if (!products.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    const slides = products.slice(0, 4).map(
      (p, i) =>
        `<div class="storefront-spotlight-slide${i === 0 ? " is-active" : ""}" data-slide="${i}">
          ${p.image_url ? `<img src="${p.image_url}" alt="">` : `<div class="storefront-spotlight-placeholder">${p.title_ar.slice(0, 1)}</div>`}
          <div class="storefront-spotlight-caption"><span>${p.title_ar}</span></div>
        </div>`,
    );
    const dots = products
      .slice(0, 4)
      .map((_, i) => `<button type="button" class="storefront-spotlight-dot${i === 0 ? " is-active" : ""}" data-slide-to="${i}" aria-label="شريحة ${i + 1}"></button>`)
      .join("");
    el.innerHTML = `<div class="storefront-spotlight-inner storefront-spotlight--rose">
      <div class="storefront-spotlight-carousel">${slides.join("")}</div>
      <div class="storefront-spotlight-dots">${dots}</div>
    </div>`;
    return;
  }
  el.hidden = true;
  el.innerHTML = "";
}

function productMediaHtml(product) {
  const media = Array.isArray(product.media_urls) ? product.media_urls : [];
  const images = (media.length ? media : product.image_url ? [product.image_url] : []).filter(Boolean);
  return `<div class="product-media-gallery">${
    images.map((url) => `<img src="${url}" alt="">`).join("") || `<div class="product-image"><span>${product.title_ar.slice(0, 1)}</span></div>`
  }${product.video_url ? `<video src="${product.video_url}" controls></video>` : ""}</div>`;
}

function fillPaymobCallbackUrls() {
  const origin = window.location.origin;
  const processed = $("merchant-paymob-processed-callback");
  const response = $("merchant-paymob-response-callback");
  const platformWebhook = $("platform-paymob-webhook");
  if (processed) processed.value = `${origin}/api/webhooks/paymob`;
  if (response) response.value = `${origin}/?payment=paymob`;
  if (platformWebhook) platformWebhook.value = `${origin}/api/webhooks/paymob`;
}

function clearAuthState() {
  state.token = "";
  state.role = "";
  state.permissions = [];
  state.effectivePermissions = {};
  state.permissionsBypass = false;
  state.staffRole = null;
  state.tenantSlug = "";
  localStorage.removeItem("easyShopeToken");
  localStorage.removeItem("easyShopeTenantSlug");
  localStorage.removeItem("easyShopeRole");
  if ($("current-user")) $("current-user").textContent = "guest";
  updateNavigation();
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 25000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (String(error?.name) === "AbortError") throw new Error("الطلب أخذ وقتًا طويلًا. جرّب مرة أخرى.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/auth/login") {
      clearAuthState();
      setOnboardingMode("login");
    }
    const baseMessage = response.status === 401 ? "انتهت جلسة تسجيل الدخول. سجّل دخول كتاجر مرة أخرى ثم أعد إنشاء الفاتورة." : data.message || `Request failed: ${response.status}`;
    const error = new Error(data.hint ? `${baseMessage} - ${data.hint}` : baseMessage);
    error.details = data.details;
    error.statusCode = response.status;
    error.payload = data;
    error.code = typeof data.code === "string" ? data.code : undefined;
    throw error;
  }
  return data;
}

function selectedProductIds() {
  return Array.from(document.querySelectorAll("[data-product-select]"))
    .filter((input) => input.checked)
    .map((input) => input.dataset.productSelect);
}

async function bulkUpdateProductsStatus(status) {
  const ids = selectedProductIds();
  if (!ids.length) return showMessage("اختر منتجًا واحدًا على الأقل.", true);
  await Promise.all(ids.map((id) => api(`/api/merchant/products/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })));
  showMessage(status === "published" ? "تم نشر المنتجات المحددة." : "تم إخفاء المنتجات المحددة.");
  await loadMerchantData();
  if (state.tenantSlug) await loadStorefront();
}

async function bulkDeleteProducts() {
  const ids = selectedProductIds();
  if (!ids.length) return showMessage("اختر منتجًا واحدًا على الأقل.", true);
  if (!confirm(`هل تريد حذف ${ids.length} منتج؟`)) return;
  await Promise.all(ids.map((id) => api(`/api/merchant/products/${id}`, { method: "DELETE", body: JSON.stringify({}) })));
  showMessage("تم حذف المنتجات المحددة.");
  await loadMerchantData();
  if (state.tenantSlug) await loadStorefront();
}

async function customerApi(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 25000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(path, {
    ...options,
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      ...(state.customerToken ? { Authorization: `Bearer ${state.customerToken}` } : {}),
      ...(options.headers || {}),
    },
  }).finally(() => clearTimeout(timer));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed: ${response.status}`);
  return data;
}

function showMessage(message, kind = "ok") {
  const el = $("message");
  if (!el || isStoreClientMode()) return;
  el.textContent = message;
  const isError = kind === true || kind === "error";
  const isWarn = kind === "warn";
  el.className = isError ? "message error" : isWarn ? "message warn" : "message ok";
  requestAnimationFrame(() => {
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      el.scrollIntoView();
    }
  });
}

function setAndroidBuildInlineFeedback(text, kind = "ok") {
  const el = $("android-build-inline-feedback");
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    el.className = "android-build-inline-feedback";
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.className =
    kind === "warn"
      ? "android-build-inline-feedback android-build-inline-feedback--warn"
      : kind === "error"
        ? "android-build-inline-feedback android-build-inline-feedback--error"
        : "android-build-inline-feedback android-build-inline-feedback--ok";
  requestAnimationFrame(() => {
    try {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      el.scrollIntoView();
    }
  });
}

function currentScope() {
  if (["platform_owner", "platform_admin"].includes(state.role)) return "admin";
  if (["merchant_owner", "merchant_staff"].includes(state.role)) return "merchant";
  if (state.role === "customer") return "customer";
  return "public";
}

function defaultViewForScope(scope = currentScope()) {
  if (scope === "admin") return "admin";
  if (scope === "merchant") return "catalog";
  if (scope === "customer") return "storefront";
  return "overview";
}

function updateNavigation() {
  const scope = currentScope();
  if (isStoreClientMode()) {
    document.body.dataset.scope = "customer";
    document.body.classList.remove("merchant-workspace", "admin-workspace");
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.hidden = true;
    });
    $("logout").hidden = true;
    hideTrialBanner();
    updateWhatsAppFab();
    return;
  }
  document.body.dataset.scope = scope;
  document.body.classList.toggle("merchant-workspace", scope === "merchant");
  document.body.classList.toggle("admin-workspace", scope === "admin");
  document.querySelectorAll(".nav-item").forEach((button) => {
    const scopes = (button.dataset.scope || "public").split(",");
    button.hidden = !scopes.includes(scope);
  });
  $("logout").hidden = scope === "public";
  if ($("merchant-summary")) $("merchant-summary").hidden = scope !== "merchant";
  if (scope !== "merchant") hideTrialBanner();
  updateWhatsAppFab();
}

function trialDaysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const end = new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

function formatTrialExpiryDate(expiresAt) {
  if (!expiresAt) return "—";
  const d = new Date(expiresAt);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ar-EG", { dateStyle: "medium" });
}

function hideTrialBanner() {
  const el = $("trial-subscription-banner");
  if (el) el.hidden = true;
}

function renderTrialBanner(tenant) {
  const el = $("trial-subscription-banner");
  if (!el || isStoreClientMode() || currentScope() !== "merchant" || !tenant) {
    hideTrialBanner();
    return;
  }
  const days = trialDaysRemaining(tenant.subscription_expires_at);
  const expiryLabel = formatTrialExpiryDate(tenant.subscription_expires_at);

  if (tenant.status === "expired" || days === 0) {
    el.hidden = false;
    el.className = "trial-subscription-banner trial-subscription-banner--danger";
    el.innerHTML = `<strong>انتهت فترة التجربة / الاشتراك</strong><span>تاريخ الانتهاء: ${expiryLabel}. ادفع اشتراك المنصة من «اشتراك المنصة» أو تواصل مع الدعم.</span><button type="button" class="mini-cta" data-merchant-jump="billing">اشتراك المنصة</button>`;
    el.querySelector("[data-merchant-jump]")?.addEventListener("click", (e) => {
      e.preventDefault();
      setMerchantTab("billing");
    });
    return;
  }

  if (tenant.status !== "trial" && tenant.status !== "active") {
    hideTrialBanner();
    return;
  }

  if (days === null) {
    hideTrialBanner();
    return;
  }

  const urgent = days <= 7;
  el.hidden = false;
  el.className = `trial-subscription-banner${urgent ? " trial-subscription-banner--warn" : ""}`;
  el.innerHTML = `<strong>تجربة مجانية — متبقي ${days} ${days === 1 ? "يوم" : "يوم"}</strong><span>ينتهي في ${expiryLabel}. ${urgent ? "باقي وقت قليل — جدّد الاشتراك لتفادي إيقاف المتجر." : "استمتع بكل المزايا خلال فترة التجربة."}</span><button type="button" class="mini-cta" data-merchant-jump="billing">اشتراك المنصة</button>`;
  el.querySelector("[data-merchant-jump]")?.addEventListener("click", (e) => {
    e.preventDefault();
    setMerchantTab("billing");
  });
}

function setOnboardingMode(mode = "register") {
  document.body.dataset.authMode = mode === "login" ? "login" : "register";
}

function setMerchantTab(tab = "overview") {
  let route = MERCHANT_TAB_ROUTES[tab] || MERCHANT_TAB_ROUTES.overview;
  if (!merchantMainTabAllowed(route.main)) {
    route = MERCHANT_TAB_ROUTES.overview;
  }
  if (!merchantSubTabAllowed(route.panel)) {
    const fallbackPanel = firstAllowedMerchantPanel(route.main);
    route = { main: route.main, panel: fallbackPanel };
  }

  state.merchantMainTab = route.main;
  state.merchantPanel = route.panel;

  document.querySelectorAll(".merchant-side-item[data-merchant-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.merchantTab === route.main);
  });

  document.querySelectorAll("[data-merchant-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.merchantPanel === route.panel);
  });

  document.querySelectorAll("[data-merchant-sub]").forEach((button) => {
    button.classList.toggle("active", button.dataset.merchantSub === route.panel);
  });

  updateMerchantSubnavs(route.main);

  if (route.panel === "billing") loadPlans().then(loadBillingData).catch((error) => showMessage(error.message, true));
  if (route.panel === "accounting") loadAccountingData().catch((error) => showMessage(error.message, true));
  if (route.panel === "android") {
    void loadAndroidBuildsOnly();
    updateAndroidThemeBridge();
  }
  if (route.panel === "themes") updateThemePickerUi();
  if (route.panel !== "categories") setCreationForm("category-form", false);
  if (route.panel !== "products") setCreationForm("product-form", false);
  updateMerchantMobileChrome(route);
  if (isMobileDashboard()) closeMerchantNav();
  updateWhatsAppFab();
}

function setAdminTab(tab = "overview") {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminTab === tab);
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.adminPanel === tab);
  });
  if (tab === "orders") void loadAdminOrders();
  if (tab === "system") void loadAdminAndroidBuilds();
  updateAdminMobileChrome(tab);
  if (isMobileDashboard()) closeAdminNav();
}

function updateWhatsAppFab() {
  const fab = $("whatsapp-support-fab");
  if (!fab) return;
  const scope = currentScope();
  const view = document.body.dataset.view;
  const merchantDashboard = scope === "merchant" && view === "catalog";
  const customerStorefront = view === "storefront" || document.body.classList.contains("store-client-mode") || document.body.classList.contains("mobile-store-client");
  const show = merchantDashboard || customerStorefront;
  fab.hidden = !show;
  fab.classList.toggle("whatsapp-support-fab--merchant", merchantDashboard);
  const merchantText = encodeURIComponent("مرحبًا، أود الاستفسار عن لوحة التاجر والمنصة");
  const customerText = encodeURIComponent("مرحبًا، أود الاستفسار عن المتجر");
  fab.href = `https://wa.me/201557827829?text=${merchantDashboard ? merchantText : customerText}`;
  const label = fab.querySelector(".whatsapp-support-fab__text strong");
  if (label) label.textContent = merchantDashboard ? "دعم التجار" : "واتساب";
}

function setView(view, options = {}) {
  updateNavigation();
  if (!$(`view-${view}`)) view = defaultViewForScope();
  document.body.dataset.view = view;
  closeMerchantNav();
  closeAdminNav();
  document.querySelectorAll(".view").forEach((element) => element.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((element) => element.classList.remove("active"));
  $(`view-${view}`)?.classList.add("active");
  document.querySelector(`.nav-item[data-view="${view}"]:not([hidden])`)?.classList.add("active");
  updateWhatsAppFab();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function refreshMe() {
  if (!state.token) {
    state.role = "";
    state.permissions = [];
    state.effectivePermissions = {};
    state.permissionsBypass = false;
    state.staffRole = null;
    $("current-user").textContent = "guest";
    updateNavigation();
    return;
  }
  const me = await api("/api/me");
  state.role = me.role;
  state.permissions = Array.isArray(me.permissions) ? me.permissions : [];
  state.effectivePermissions = me.effectivePermissions || {};
  state.permissionsBypass = Boolean(me.permissionsBypass);
  state.staffRole = me.staffRole || null;
  state.tenantSlug = me.slug || state.tenantSlug;
  localStorage.setItem("easyShopeRole", state.role);
  localStorage.setItem("easyShopeTenantSlug", state.tenantSlug);
  $("current-user").textContent = `${me.name} (${me.role})`;
  $("tenant-slug").value = state.tenantSlug || "";
  if ($("overview-slug")) $("overview-slug").textContent = state.tenantSlug || "غير محدد";
  updateNavigation();
  applyMerchantPermissions();
}

async function registerMerchant(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  try {
    button.disabled = true;
    button.textContent = "جارٍ إنشاء المتجر...";
    $("register-result").innerHTML = "<strong>جارٍ إنشاء المتجر</strong><p>نجهز حساب التاجر والمتجر الآن.</p>";
    const form = new FormData(event.currentTarget);
    const data = await api("/api/auth/register-merchant", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    state.token = data.token;
    state.role = data.user.role;
    state.tenantSlug = data.tenant.slug;
    localStorage.setItem("easyShopeToken", state.token);
    localStorage.setItem("easyShopeRole", state.role);
    localStorage.setItem("easyShopeTenantSlug", state.tenantSlug);
    if (data.tenant?.serial_code) {
      localStorage.setItem("easyShopeStoreSerial", data.tenant.serial_code);
      updateLoginSerialDisplay(data.tenant.serial_code);
    }
    const serialLine = data.tenant?.serial_code ? `<p>رقم المتجر التسلسلي: <strong>${data.tenant.serial_code}</strong></p>` : "";
    $("register-result").innerHTML = `<strong>تم إنشاء المتجر</strong><p>معرف المتجر: ${data.tenant.slug}</p>${serialLine}<p>تم تسجيل الدخول كتاجر.</p>`;
    showMessage("تم تسجيل التاجر وإنشاء المتجر.");
    await bootstrap();
    setView(defaultViewForScope());
  } catch (error) {
    showMessage(error.message, true);
    $("register-result").innerHTML = `<strong>تعذر إنشاء المتجر</strong><p>${error.message}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = "إنشاء المتجر ولوحة التحكم";
  }
}

function setOnboardingMode(mode = "register") {
  document.body.dataset.authMode = mode === "login" ? "login" : "register";
  if (mode === "login") void refreshLoginSerialDisplay();
}

function updateLoginSerialDisplay(serial) {
  const card = $("login-store-serial");
  const value = $("login-store-serial-value");
  const hint = $("login-store-serial-hint");
  const code = String(serial || "").trim();
  if (value) value.textContent = code || "—";
  if (card) card.classList.toggle("login-serial-card--ready", Boolean(code));
  if (hint) {
    hint.textContent = code
      ? "احفظ هذا الرقم للدعم الفني أو عند التواصل مع المنصة."
      : "سيظهر رقم متجرك هنا بعد تسجيل الدخول بنجاح.";
  }
}

async function refreshLoginSerialDisplay() {
  const cached = localStorage.getItem("easyShopeStoreSerial");
  if (cached) {
    updateLoginSerialDisplay(cached);
    return;
  }
  if (!state.token || ["platform_owner", "platform_admin"].includes(state.role)) {
    updateLoginSerialDisplay("");
    return;
  }
  try {
    const data = await api("/api/merchant/store");
    const serial = data.store?.serial_code || "";
    if (serial) {
      localStorage.setItem("easyShopeStoreSerial", serial);
      updateLoginSerialDisplay(serial);
    } else {
      updateLoginSerialDisplay("");
    }
  } catch {
    updateLoginSerialDisplay("");
  }
}

async function login(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  try {
    button.disabled = true;
    button.textContent = "جارٍ الدخول...";
    const form = new FormData(event.currentTarget);
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
    state.token = data.token;
    state.role = data.user.role;
    state.effectivePermissions = data.effectivePermissions || {};
    state.permissionsBypass = Boolean(data.user?.permissionsBypass);
    state.staffRole = data.user?.staffRole || null;
    localStorage.setItem("easyShopeToken", state.token);
    localStorage.setItem("easyShopeRole", state.role);
    if (data.storeSerial) {
      localStorage.setItem("easyShopeStoreSerial", data.storeSerial);
      updateLoginSerialDisplay(data.storeSerial);
    } else if (data.user?.tenantId) {
      try {
        state.token = data.token;
        state.role = data.user.role;
        const storeData = await api("/api/merchant/store");
        const serial = storeData.store?.serial_code || "";
        if (serial) {
          localStorage.setItem("easyShopeStoreSerial", serial);
          updateLoginSerialDisplay(serial);
        }
      } catch {
        /* serial stays placeholder until store loads in bootstrap */
      }
    }
    showMessage("تم تسجيل الدخول.");
    await bootstrap();
    setView(defaultViewForScope());
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "دخول";
  }
}

async function submitNewProduct(payload, productId = null) {
  showMessage(productId ? "جارٍ تحديث المنتج..." : "جارٍ حفظ المنتج...");
  if (productId) {
    await api(`/api/merchant/products/${productId}`, { method: "PATCH", body: JSON.stringify(payload), timeoutMs: 25000 });
    showMessage("تم تحديث المنتج.");
  } else {
    await api("/api/merchant/products", { method: "POST", body: JSON.stringify(payload), timeoutMs: 25000 });
    showMessage("تم إنشاء المنتج.");
  }
}

async function createCategory(event) {
  event.preventDefault();
  event.stopPropagation();
  const formEl = event.currentTarget;
  const button = event.currentTarget.querySelector("[data-submit-category]");
  try {
    button.disabled = true;
    button.textContent = "جارٍ إضافة الصنف...";
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const imageUrl = await fileToDataUrl(form.get("imageFile"));
    delete payload.imageFile;
    if (imageUrl) payload.imageUrl = imageUrl;
    await api("/api/merchant/categories", { method: "POST", body: JSON.stringify(payload) });
    showMessage("تم إنشاء التصنيف.");
    formEl?.reset?.();
    $("category-filter").value = "";
    await loadMerchantData();
    closeAppModal();
    setMerchantTab("categories");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "إضافة تصنيف";
  }
}

function openCategoryModal() {
  const bodyHtml = `
    <form id="category-modal-form" class="form-grid wizard-form">
      <label>اسم التصنيف عربي<input name="nameAr" id="cm-nameAr" required></label>
      <label>اسم التصنيف إنجليزي<input name="nameEn" id="cm-nameEn" required></label>
      <label class="span-2">صورة التصنيف<input name="imageFile" type="file" accept="image/*"></label>
    </form>`;
  openAppModal({
    title: "إضافة صنف جديد",
    bodyHtml,
    footHtml: `<button type="button" class="secondary" id="cm-cancel">إلغاء</button><button type="button" id="cm-submit">إضافة الصنف</button>`,
  });
  $("cm-cancel")?.addEventListener("click", closeAppModal);
  $("cm-submit")?.addEventListener("click", async () => {
    const form = $("category-modal-form");
    if (!form?.reportValidity()) return;
    const fd = new FormData(form);
    const button = $("cm-submit");
    try {
      button.disabled = true;
      button.textContent = "جارٍ الإضافة...";
      const payload = Object.fromEntries(fd.entries());
      const imageUrl = await fileToDataUrl(fd.get("imageFile"));
      delete payload.imageFile;
      if (imageUrl) payload.imageUrl = imageUrl;
      await api("/api/merchant/categories", { method: "POST", body: JSON.stringify(payload) });
      showMessage("تم إنشاء التصنيف.");
      $("category-filter").value = "";
      await loadMerchantData();
      closeAppModal();
      setMerchantTab("categories");
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "إضافة الصنف";
    }
  });
}

const productWizardState = { step: 1, data: {}, variantRows: [], editId: null };

function effectivePriceCents(product) {
  const base = Number(product?.price_cents ?? product?.priceCents ?? 0) || 0;
  const pct = Math.min(100, Math.max(0, Number(product?.discount_percent ?? product?.discountPercent ?? 0) || 0));
  if (!pct) return base;
  return Math.max(0, Math.round(base * (1 - pct / 100)));
}

function parseStoreSettingsClient(raw) {
  const defaults = {
    paymentMethods: { paymob: true, cod: true, fawry: false, easycash: false },
    codFeeCents: 0,
    freeShippingMinCents: 0,
    shippingRates: [],
    metaPixelId: "",
    gtmId: "",
    customDomain: "",
    merchantWhatsAppPhone: "",
    notifyWhatsAppOnNewOrder: true,
    notifyEmailOnStatusChange: true,
    defaultCarrier: "manual",
    reviewsEnabled: true,
  };
  if (!raw || typeof raw !== "object") return defaults;
  const pm = raw.paymentMethods || {};
  return {
    paymentMethods: {
      paymob: pm.paymob !== false,
      cod: pm.cod !== false,
      fawry: Boolean(pm.fawry),
      easycash: Boolean(pm.easycash),
    },
    codFeeCents: Math.max(0, Math.round(Number(raw.codFeeCents) || 0)),
    freeShippingMinCents: Math.max(0, Math.round(Number(raw.freeShippingMinCents) || 0)),
    shippingRates: Array.isArray(raw.shippingRates) ? raw.shippingRates : [],
    metaPixelId: String(raw.metaPixelId || "").trim(),
    gtmId: String(raw.gtmId || "").trim(),
    customDomain: String(raw.customDomain || "").trim(),
    merchantWhatsAppPhone: String(raw.merchantWhatsAppPhone || "").trim(),
    notifyWhatsAppOnNewOrder: raw.notifyWhatsAppOnNewOrder !== false,
    notifyEmailOnStatusChange: raw.notifyEmailOnStatusChange !== false,
    defaultCarrier: ["bosta", "aramex"].includes(String(raw.defaultCarrier)) ? raw.defaultCarrier : "manual",
    reviewsEnabled: raw.reviewsEnabled !== false,
  };
}

function productWizardCategoryOptions(selected = "") {
  return (
    `<option value="">بدون تصنيف</option>` +
    state.merchantCategories.map((item) => `<option value="${item.id}"${String(item.id) === String(selected) ? " selected" : ""}>${item.name_ar}</option>`).join("")
  );
}

function renderProductWizardVariants() {
  return productWizardState.variantRows
    .map(
      (v, i) => `
    <div class="variant-row" data-wizard-variant="${i}">
      <input data-field="type" placeholder="النوع / المقاس" value="${escapeHtmlText(v.type || "")}">
      <input data-field="color" placeholder="اللون" value="${escapeHtmlText(v.color || "")}">
      <input data-field="extraPrice" type="number" step="0.01" placeholder="إضافة سعر" value="${v.extraPrice || ""}">
      <input data-field="stock" type="number" placeholder="مخزون" value="${v.stock ?? ""}">
      <button type="button" class="danger-button" data-remove-wizard-variant="${i}">حذف</button>
    </div>`
    )
    .join("");
}

function collectProductWizardStep() {
  const d = productWizardState.data;
  const step = productWizardState.step;
  if (step === 1) {
    d.titleAr = $("pw-titleAr")?.value.trim() || "";
    d.titleEn = $("pw-titleEn")?.value.trim() || "";
    d.categoryId = $("pw-categoryId")?.value || "";
    d.description = $("pw-description")?.value.trim() || "";
  } else if (step === 2) {
    d.price = $("pw-price")?.value || "";
    d.discountPercent = $("pw-discountPercent")?.value || "0";
    d.compareAtPrice = $("pw-compareAtPrice")?.value || "";
    d.stockQuantity = $("pw-stockQuantity")?.value || "10";
  } else if (step === 3) {
    d.videoUrl = $("pw-videoUrl")?.value.trim() || "";
    d.imageFiles = $("pw-imageFiles")?.files || null;
  } else if (step === 4) {
    d.status = $("pw-status")?.value || "draft";
    productWizardState.variantRows = Array.from(document.querySelectorAll("[data-wizard-variant]")).map((row) => ({
      type: row.querySelector('[data-field="type"]')?.value.trim() || "",
      color: row.querySelector('[data-field="color"]')?.value.trim() || "",
      extraPrice: row.querySelector('[data-field="extraPrice"]')?.value || "",
      stock: row.querySelector('[data-field="stock"]')?.value || "",
    }));
  }
}

function productWizardStepHtml(step) {
  const d = productWizardState.data;
  if (step === 1) {
    return `<div class="wizard-steps-indicator" aria-hidden="true"><span class="active">1</span><span>2</span><span>3</span><span>4</span></div>
      <p class="wizard-lead">ابدأ باسم المنتج والتصنيف.</p>
      <label>اسم المنتج عربي<input id="pw-titleAr" required value="${escapeHtmlText(d.titleAr || "")}"></label>
      <label>اسم المنتج إنجليزي<input id="pw-titleEn" required value="${escapeHtmlText(d.titleEn || "")}"></label>
      <label>التصنيف<select id="pw-categoryId">${productWizardCategoryOptions(d.categoryId)}</select></label>
      <label>الوصف<textarea id="pw-description">${escapeHtmlText(d.description || "")}</textarea></label>`;
  }
  if (step === 2) {
    return `<div class="wizard-steps-indicator" aria-hidden="true"><span class="done">1</span><span class="active">2</span><span>3</span><span>4</span></div>
      <p class="wizard-lead">حدّد السعر والمخزون.</p>
      <label>السعر (جنيه)<input id="pw-price" type="number" step="0.01" required value="${escapeHtmlText(d.price || "")}"></label>
      <label>خصم %<input id="pw-discountPercent" type="number" min="0" max="100" value="${escapeHtmlText(d.discountPercent ?? "0")}"></label>
      <label>السعر قبل الخصم (اختياري)<input id="pw-compareAtPrice" type="number" step="0.01" value="${escapeHtmlText(d.compareAtPrice || "")}"></label>
      <label>المخزون<input id="pw-stockQuantity" type="number" value="${escapeHtmlText(d.stockQuantity ?? "10")}"></label>`;
  }
  if (step === 3) {
    return `<div class="wizard-steps-indicator" aria-hidden="true"><span class="done">1</span><span class="done">2</span><span class="active">3</span><span>4</span></div>
      <p class="wizard-lead">أضف صورًا واضحة — حتى 6 صور.</p>
      <label>صور المنتج<input id="pw-imageFiles" type="file" accept="image/*" multiple></label>
      <label>رابط فيديو (اختياري)<input id="pw-videoUrl" type="url" placeholder="https://..." value="${escapeHtmlText(d.videoUrl || "")}"></label>`;
  }
  return `<div class="wizard-steps-indicator" aria-hidden="true"><span class="done">1</span><span class="done">2</span><span class="done">3</span><span class="active">4</span></div>
    <p class="wizard-lead">خيارات إضافية ثم انشر أو احفظ كمسودة.</p>
    <label>الحالة<select id="pw-status"><option value="draft"${d.status === "draft" ? " selected" : ""}>مسودة</option><option value="published"${d.status === "published" ? " selected" : ""}>منشور</option></select></label>
    <div class="variant-builder">
      <div class="panel-heading"><span class="eyebrow">خيارات</span><h3>النوع واللون (اختياري)</h3></div>
      <div id="pw-variant-rows" class="variant-rows">${renderProductWizardVariants()}</div>
      <button type="button" class="secondary" id="pw-add-variant">إضافة نوع / لون</button>
    </div>`;
}

function bindProductWizardEvents(step) {
  $("pw-add-variant")?.addEventListener("click", () => {
    collectProductWizardStep();
    productWizardState.variantRows.push({});
    $("pw-variant-rows").innerHTML = renderProductWizardVariants();
    bindProductWizardEvents(step);
  });
  document.querySelectorAll("[data-remove-wizard-variant]").forEach((btn) => {
    btn.addEventListener("click", () => {
      collectProductWizardStep();
      const idx = Number(btn.dataset.removeWizardVariant);
      productWizardState.variantRows.splice(idx, 1);
      $("pw-variant-rows").innerHTML = renderProductWizardVariants();
      bindProductWizardEvents(step);
    });
  });
  $("pw-back")?.addEventListener("click", () => {
    collectProductWizardStep();
    openProductWizard(step - 1);
  });
  $("pw-next")?.addEventListener("click", async () => {
    if (step === 1) {
      if (!$("pw-titleAr")?.value.trim() || !$("pw-titleEn")?.value.trim()) {
        showMessage("أدخل اسم المنتج بالعربي والإنجليزي.", true);
        return;
      }
    }
    if (step === 2 && !$("pw-price")?.value) {
      showMessage("أدخل سعر المنتج.", true);
      return;
    }
    collectProductWizardStep();
    if (step < 4) {
      openProductWizard(step + 1);
      return;
    }
    await submitProductWizard();
  });
}

function openProductWizard(step = 1, options = {}) {
  if (step === 1 && options.reset) {
    productWizardState.data = { status: "draft", discountPercent: "0", stockQuantity: "10" };
    productWizardState.variantRows = [];
    productWizardState.editId = null;
  }
  if (options.product) {
    const p = options.product;
    productWizardState.editId = p.id;
    productWizardState.data = {
      titleAr: p.title_ar,
      titleEn: p.title_en,
      description: p.description || "",
      categoryId: p.category_id || "",
      price: (p.price_cents / 100).toFixed(2),
      compareAtPrice: p.compare_at_price_cents ? (p.compare_at_price_cents / 100).toFixed(2) : "",
      discountPercent: String(p.discount_percent || 0),
      stockQuantity: String(p.stock_quantity ?? 0),
      status: p.status || "draft",
      videoUrl: p.video_url || "",
    };
    productWizardState.variantRows = Array.isArray(p.variants)
      ? p.variants.map((v) => ({
          type: v.type || "",
          color: v.color || "",
          extraPrice: v.extraPriceCents != null ? (v.extraPriceCents / 100).toFixed(2) : "",
          stock: v.stockQuantity ?? "",
        }))
      : [];
  }
  productWizardState.step = step;
  const isEdit = Boolean(productWizardState.editId);
  const foot =
    step > 1
      ? `<button type="button" class="secondary" id="pw-back">رجوع</button><button type="button" id="pw-next">${step < 4 ? "التالي" : isEdit ? "حفظ التعديلات" : "إضافة المنتج"}</button>`
      : `<button type="button" class="secondary" id="pw-cancel">إلغاء</button><button type="button" id="pw-next">التالي</button>`;
  openAppModal({
    title: `${isEdit ? "تعديل منتج" : "إضافة منتج"} — الخطوة ${step} من 4`,
    bodyHtml: productWizardStepHtml(step),
    footHtml: foot,
  });
  $("pw-cancel")?.addEventListener("click", closeAppModal);
  bindProductWizardEvents(step);
}

function openProductEdit(product) {
  openProductWizard(1, { product });
}

async function submitProductWizard() {
  const d = productWizardState.data;
  const button = $("pw-next");
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "جارٍ الإضافة...";
    }
    const imageFiles = d.imageFiles ? Array.from(d.imageFiles).filter((f) => f?.size) : [];
    if (imageFiles.length > 6) throw new Error("اختر بحد أقصى 6 صور للمنتج.");
    const totalImageBytes = imageFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalImageBytes > 6 * 1024 * 1024) throw new Error("إجمالي حجم الصور كبير. استخدم صورًا أقل/أخف (حد أقصى 6MB).");
    showMessage("جارٍ تجهيز الصور...");
    const mediaUrls = [];
    for (const file of imageFiles) {
      mediaUrls.push(await fileToDataUrl(file));
      await sleep(0);
    }
    const variants = (productWizardState.variantRows || [])
      .map((v) => ({
        type: v.type || "",
        color: v.color || "",
        extraPriceCents: parseMoneyToCents(v.extraPrice || 0),
        stockQuantity: v.stock ? Number(v.stock) : null,
      }))
      .filter((v) => v.type || v.color);
    const payload = {
      titleAr: d.titleAr,
      titleEn: d.titleEn,
      description: d.description || "",
      categoryId: d.categoryId || undefined,
      priceCents: parseMoneyToCents(d.price),
      discountPercent: Number(d.discountPercent || 0),
      stockQuantity: Number(d.stockQuantity || 0),
      status: d.status || "draft",
      mediaUrls: mediaUrls.filter(Boolean),
      imageUrl: mediaUrls[0] || "",
      videoUrl: d.videoUrl || "",
      variants,
    };
    if (d.compareAtPrice) payload.compareAtPriceCents = parseMoneyToCents(d.compareAtPrice);
    if (!payload.categoryId) delete payload.categoryId;
    if (!payload.imageUrl) delete payload.imageUrl;
    if (!payload.videoUrl) delete payload.videoUrl;
    const editId = productWizardState.editId;
    await submitNewProduct(payload, editId);
    $("product-filter").value = "";
    $("product-filter-category").value = "";
    $("product-filter-status").value = "";
    await loadMerchantData();
    closeAppModal();
    setMerchantTab("products");
    productWizardState.editId = null;
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "إضافة المنتج";
    }
  }
}

function addVariantRow(variant = {}) {
  const container = $("variant-rows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "variant-row";
  row.innerHTML = `
    <input name="variantType" placeholder="النوع / المقاس" value="${variant.type || ""}">
    <input name="variantColor" placeholder="اللون" value="${variant.color || ""}">
    <input name="variantExtraPrice" type="number" step="0.01" placeholder="إضافة سعر" value="${variant.extraPrice || ""}">
    <input name="variantStock" type="number" placeholder="مخزون اختياري" value="${variant.stockQuantity ?? ""}">
    <button type="button" class="danger-button" data-remove-variant>حذف</button>
  `;
  row.querySelector("[data-remove-variant]").addEventListener("click", () => row.remove());
  container.appendChild(row);
}

function resetVariants() {
  if ($("variant-rows")) $("variant-rows").innerHTML = "";
}

function collectVariants() {
  return Array.from(document.querySelectorAll(".variant-row"))
    .map((row) => ({
      type: row.querySelector('[name="variantType"]').value.trim(),
      color: row.querySelector('[name="variantColor"]').value.trim(),
      extraPriceCents: parseMoneyToCents(row.querySelector('[name="variantExtraPrice"]').value),
      stockQuantity: row.querySelector('[name="variantStock"]').value ? Number(row.querySelector('[name="variantStock"]').value) : null,
    }))
    .filter((variant) => variant.type || variant.color);
}

async function createProduct(event) {
  event.preventDefault();
  event.stopPropagation();
  const formEl = event.currentTarget;
  const button = event.currentTarget.querySelector("[data-submit-product]");
  try {
    button.disabled = true;
    button.textContent = "جارٍ إضافة المنتج...";
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const imageFiles = form.getAll("imageFiles").filter((file) => file?.size);
    if (imageFiles.length > 6) throw new Error("اختر بحد أقصى 6 صور للمنتج.");
    const totalImageBytes = imageFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalImageBytes > 6 * 1024 * 1024) throw new Error("إجمالي حجم الصور كبير. استخدم صورًا أقل/أخف (حد أقصى 6MB).");
    showMessage("جارٍ تجهيز الصور...");
    const mediaUrls = [];
    for (const file of imageFiles) {
      mediaUrls.push(await fileToDataUrl(file));
      await sleep(0);
    }
    if (form.get("videoFile")?.size) throw new Error("رفع الفيديو من الجهاز غير مدعوم حاليًا. استخدم رابط فيديو فقط.");
    payload.priceCents = parseMoneyToCents(payload.price);
    if (payload.compareAtPrice) payload.compareAtPriceCents = parseMoneyToCents(payload.compareAtPrice);
    payload.discountPercent = Number(payload.discountPercent || 0);
    payload.stockQuantity = Number(payload.stockQuantity || 0);
    payload.mediaUrls = mediaUrls.filter(Boolean);
    payload.imageUrl = payload.mediaUrls[0] || "";
    payload.videoUrl = payload.videoUrl || "";
    payload.variants = collectVariants();
    delete payload.price;
    delete payload.compareAtPrice;
    delete payload.imageFiles;
    delete payload.videoFile;
    if (!payload.categoryId) delete payload.categoryId;
    if (!payload.imageUrl) delete payload.imageUrl;
    if (!payload.videoUrl) delete payload.videoUrl;
    await submitNewProduct(payload);
    formEl?.reset?.();
    $("product-filter").value = "";
    $("product-filter-category").value = "";
    $("product-filter-status").value = "";
    resetVariants();
    await loadMerchantData();
    setCreationForm("product-form", false);
    setMerchantTab("products");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "إضافة منتج";
  }
}

async function saveStoreSettings(event) {
  event.preventDefault();
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  const payload = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim()));
  const logoFile = $("store-logo-file")?.files?.[0];
  if (logoFile) payload.logoUrl = await fileToDataUrl(logoFile);
  const data = await api("/api/merchant/store", { method: "PATCH", body: JSON.stringify(payload) });
  showMessage("تم حفظ إعدادات المتجر.");
  fillStoreSettings(data.store);
  await refreshMe();
}

async function createStaff(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  try {
    button.disabled = true;
    button.textContent = "جارٍ إضافة الموظف...";
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    await api("/api/merchant/staff", { method: "POST", body: JSON.stringify(payload) });
    showMessage("تم إضافة الموظف.");
    event.currentTarget.reset();
    await loadStaff();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "إضافة موظف";
  }
}

async function changePassword(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  try {
    button.disabled = true;
    button.textContent = "جارٍ التحديث...";
    const form = new FormData(event.currentTarget);
    await api("/api/auth/change-password", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
    showMessage("تم تحديث كلمة المرور.");
    event.currentTarget.reset();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "تحديث كلمة المرور";
  }
}

function fillStoreSettings(store) {
  if (!store) return;
  $("store-name-ar").value = store.name_ar || "";
  $("store-name-en").value = store.name_en || "";
  $("store-country").value = store.country || "";
  if ($("store-brand-color")) $("store-brand-color").value = store.brand_color || "";
  if ($("checkout-provider")) $("checkout-provider").value = store.checkout_provider || "paymob";
  const th = store.storefront_theme || "ocean";
  state.savedStorefrontTheme = th;
  state.storefrontThemeDraft = th;
  updateThemePickerUi();
  const slug = store.slug || state.tenantSlug || "";
  const webUrl = slug ? `${window.location.origin}/store/${slug}` : "";
  const hashUrl = slug ? `${window.location.origin}/#store/${slug}` : "";
  if ($("storefront-web-url")) $("storefront-web-url").textContent = webUrl || "سيظهر بعد تحميل المتجر.";
  if ($("storefront-url")) $("storefront-url").textContent = hashUrl || "—";
  renderStoreLogoPreview(store.logo_url);
  renderMerchantBrand(store);
  fillCheckoutSettings(store);
}

function fillCheckoutSettings(store) {
  if (!store) return;
  const settings = parseStoreSettingsClient(store.store_settings);
  state.storeSettings = settings;
  const payForm = $("checkout-settings-form");
  if (payForm) {
    payForm.paymob.checked = settings.paymentMethods.paymob;
    payForm.cod.checked = settings.paymentMethods.cod;
    payForm.fawry.checked = settings.paymentMethods.fawry;
    if (payForm.easycash) payForm.easycash.checked = settings.paymentMethods.easycash;
    if (payForm.codFee) payForm.codFee.value = (settings.codFeeCents / 100).toFixed(2);
    if (payForm.freeShippingMin) payForm.freeShippingMin.value = settings.freeShippingMinCents ? (settings.freeShippingMinCents / 100).toFixed(2) : "0";
  }
  const trackForm = $("tracking-settings-form");
  if (trackForm) {
    trackForm.metaPixelId.value = settings.metaPixelId || "";
    trackForm.gtmId.value = settings.gtmId || "";
  }
  const notifyForm = $("notify-settings-form");
  if (notifyForm) {
    notifyForm.merchantWhatsAppPhone.value = settings.merchantWhatsAppPhone || "";
    notifyForm.notifyWhatsAppOnNewOrder.checked = settings.notifyWhatsAppOnNewOrder;
    notifyForm.notifyEmailOnStatusChange.checked = settings.notifyEmailOnStatusChange;
    notifyForm.defaultCarrier.value = settings.defaultCarrier || "manual";
  }
  const domainForm = $("domain-settings-form");
  if (domainForm) {
    domainForm.customDomain.value = settings.customDomain || "";
    const cnameHost = $("platform-cname-host");
    if (cnameHost) cnameHost.textContent = window.location.host || "shope.easytecheg.net";
  }
  const reviewsForm = $("reviews-settings-form");
  if (reviewsForm?.reviewsEnabled) reviewsForm.reviewsEnabled.checked = settings.reviewsEnabled;
  renderShippingRatesEditor(settings.shippingRates);
  void loadCouponsList();
  void loadMerchantReviewsList();
}

function renderShippingRatesEditor(rates) {
  const wrap = $("shipping-rates-table");
  const form = $("shipping-rates-form");
  if (!wrap || !form) return;
  const list = rates?.length
    ? rates
    : [
        { id: "cairo", nameAr: "القاهرة", nameEn: "Cairo", feeCents: 3500 },
        { id: "giza", nameAr: "الجيزة", nameEn: "Giza", feeCents: 3500 },
        { id: "alexandria", nameAr: "الإسكندرية", nameEn: "Alexandria", feeCents: 4500 },
        { id: "other", nameAr: "محافظات أخرى", nameEn: "Other", feeCents: 6500 },
      ];
  wrap.innerHTML = `<table class="data-table"><thead><tr><th>المحافظة</th><th>الرسوم (جنيه)</th></tr></thead><tbody>${list
    .map(
      (r) => `<tr><td><strong>${r.nameAr}</strong><br><small>${r.id}</small></td><td><input type="number" step="0.01" min="0" data-shipping-id="${r.id}" data-shipping-ar="${r.nameAr}" data-shipping-en="${r.nameEn}" value="${(r.feeCents / 100).toFixed(2)}"></td></tr>`,
    )
    .join("")}</tbody></table>`;
}

async function saveCheckoutSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    storeSettings: {
      paymentMethods: {
        paymob: form.paymob.checked,
        cod: form.cod.checked,
        fawry: form.fawry.checked,
        easycash: form.easycash?.checked ?? false,
      },
      codFeeCents: parseMoneyToCents(form.codFee.value || 0),
      freeShippingMinCents: parseMoneyToCents(form.freeShippingMin.value || 0),
    },
  };
  const data = await api("/api/merchant/store", { method: "PATCH", body: JSON.stringify(payload) });
  showMessage("تم حفظ إعدادات الدفع.");
  fillCheckoutSettings(data.store);
}

async function saveShippingRates(event) {
  event.preventDefault();
  const rates = Array.from(document.querySelectorAll("[data-shipping-id]")).map((input) => ({
    id: input.dataset.shippingId,
    nameAr: input.dataset.shippingAr,
    nameEn: input.dataset.shippingEn,
    feeCents: parseMoneyToCents(input.value || 0),
  }));
  const data = await api("/api/merchant/store", { method: "PATCH", body: JSON.stringify({ storeSettings: { shippingRates: rates } }) });
  showMessage("تم حفظ أسعار الشحن.");
  fillCheckoutSettings(data.store);
}

async function saveTrackingSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = await api("/api/merchant/store", {
    method: "PATCH",
    body: JSON.stringify({ storeSettings: { metaPixelId: form.metaPixelId.value.trim(), gtmId: form.gtmId.value.trim() } }),
  });
  showMessage("تم حفظ أكواد التتبع.");
  fillCheckoutSettings(data.store);
}

async function saveNotifySettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = await api("/api/merchant/store", {
    method: "PATCH",
    body: JSON.stringify({
      storeSettings: {
        merchantWhatsAppPhone: form.merchantWhatsAppPhone.value.trim(),
        notifyWhatsAppOnNewOrder: form.notifyWhatsAppOnNewOrder.checked,
        notifyEmailOnStatusChange: form.notifyEmailOnStatusChange.checked,
        defaultCarrier: form.defaultCarrier.value,
      },
    }),
  });
  showMessage("تم حفظ إعدادات الإشعارات.");
  fillCheckoutSettings(data.store);
}

async function saveDomainSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = await api("/api/merchant/store", {
    method: "PATCH",
    body: JSON.stringify({ storeSettings: { customDomain: form.customDomain.value.trim() } }),
  });
  showMessage("تم حفظ الدومين المخصص.");
  fillCheckoutSettings(data.store);
}

async function saveReviewsSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = await api("/api/merchant/store", {
    method: "PATCH",
    body: JSON.stringify({ storeSettings: { reviewsEnabled: form.reviewsEnabled.checked } }),
  });
  showMessage("تم حفظ إعدادات التقييمات.");
  fillCheckoutSettings(data.store);
}

async function loadMerchantReviewsList() {
  const list = $("merchant-reviews-list");
  if (!list || !state.token) return;
  try {
    const data = await api("/api/merchant/reviews");
    list.innerHTML =
      (data.reviews || [])
        .map(
          (r) => `<li><strong>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</strong> ${r.customer_name}<br><small>${r.title_ar || r.title_en} — ${r.status}</small><p>${escapeHtmlText(r.comment || "")}</p><span class="row-actions">${r.status === "pending" ? `<button class="mini-button success-button" data-review-publish="${r.id}">نشر</button>` : ""}<button class="mini-button danger-button" data-review-delete="${r.id}">حذف</button></span></li>`,
        )
        .join("") || "<li>لا توجد تقييمات بعد.</li>";
    list.querySelectorAll("[data-review-publish]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api(`/api/merchant/reviews/${btn.dataset.reviewPublish}`, { method: "PATCH", body: JSON.stringify({ status: "published" }) });
        showMessage("تم نشر التقييم.");
        await loadMerchantReviewsList();
      });
    });
    list.querySelectorAll("[data-review-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("حذف التقييم؟")) return;
        await api(`/api/merchant/reviews/${btn.dataset.reviewDelete}`, { method: "DELETE", body: JSON.stringify({}) });
        showMessage("تم حذف التقييم.");
        await loadMerchantReviewsList();
      });
    });
  } catch {
    list.innerHTML = "<li>تعذر تحميل التقييمات.</li>";
  }
}

async function loadCouponsList() {
  const list = $("coupons-list");
  if (!list || !state.token) return;
  try {
    const data = await api("/api/merchant/coupons");
    state.merchantCoupons = data.coupons || [];
    list.innerHTML =
      state.merchantCoupons
        .map(
          (c) => `<li><strong>${c.code}</strong><small>${c.discount_type === "percent" ? `${c.discount_value}%` : money(c.discount_value)} — استخدم ${c.used_count}${c.max_uses ? `/${c.max_uses}` : ""}</small><span class="row-actions"><button class="mini-button danger-button" data-coupon-delete="${c.id}">حذف</button></span></li>`,
        )
        .join("") || "<li>لا توجد أكواد خصم.</li>";
    document.querySelectorAll("[data-coupon-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("حذف كود الخصم؟")) return;
        await api(`/api/merchant/coupons/${btn.dataset.couponDelete}`, { method: "DELETE", body: JSON.stringify({}) });
        showMessage("تم حذف الكود.");
        await loadCouponsList();
      });
    });
  } catch {
    list.innerHTML = "<li>تعذر تحميل أكواد الخصم.</li>";
  }
}

async function createCoupon(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    code: form.get("code"),
    discountType: form.get("discountType"),
    discountValue: form.get("discountType") === "percent" ? Number(form.get("discountValue")) : parseMoneyToCents(form.get("discountValue")),
    minOrderCents: parseMoneyToCents(form.get("minOrder") || 0),
    maxUses: form.get("maxUses") ? Number(form.get("maxUses")) : null,
  };
  await api("/api/merchant/coupons", { method: "POST", body: JSON.stringify(payload) });
  showMessage("تم إنشاء كود الخصم.");
  event.currentTarget.reset();
  await loadCouponsList();
}

function injectStoreTracking(checkout) {
  if (!checkout) return;
  if (checkout.gtmId && !document.getElementById("es-gtm")) {
    const gtm = document.createElement("script");
    gtm.id = "es-gtm";
    gtm.textContent = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${checkout.gtmId}');`;
    document.head.appendChild(gtm);
  }
  if (checkout.metaPixelId && !document.getElementById("es-fbpixel")) {
    const px = document.createElement("script");
    px.id = "es-fbpixel";
    px.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${checkout.metaPixelId}');fbq('track','PageView');`;
    document.head.appendChild(px);
  }
}

function renderCheckoutPaymentMethods(checkout) {
  const fieldset = $("checkout-payment-methods");
  if (!fieldset || !checkout?.paymentMethods) return;
  const pm = checkout.paymentMethods;
  fieldset.querySelectorAll("label").forEach((label) => {
    const input = label.querySelector("input");
    const method = input?.value;
    if (method === "easycash") {
      label.hidden = !pm.easycash;
    } else {
      label.hidden = !pm[method];
    }
  });
  const firstVisible = fieldset.querySelector("label:not([hidden]) input");
  if (firstVisible) firstVisible.checked = true;
}

function renderCheckoutGovernorates(checkout) {
  const select = $("checkout-governorate");
  if (!select) return;
  const rates = checkout?.shippingRates?.length
    ? checkout.shippingRates
    : [
        { id: "cairo", nameAr: "القاهرة" },
        { id: "giza", nameAr: "الجيزة" },
        { id: "alexandria", nameAr: "الإسكندرية" },
        { id: "other", nameAr: "محافظات أخرى" },
      ];
  select.innerHTML = rates.map((r) => `<option value="${r.id}">${r.nameAr}</option>`).join("");
}

async function updateCheckoutQuote() {
  const slug = $("tenant-slug")?.value?.trim();
  if (!slug || !state.cart.length) return;
  const form = $("order-form");
  if (!form) return;
  const fd = new FormData(form);
  const payload = {
    customerName: fd.get("customerName") || "Guest",
    customerPhone: fd.get("customerPhone") || "01000000000",
    customerEmail: fd.get("customerEmail") || undefined,
    shippingAddress: fd.get("shippingAddress") || undefined,
    governorate: fd.get("governorate") || undefined,
    paymentMethod: fd.get("paymentMethod") || "paymob",
    couponCode: fd.get("couponCode") || undefined,
    items: state.cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
  };
  try {
    const data = await api(`/api/store/${slug}/checkout/quote`, { method: "POST", body: JSON.stringify(payload) });
    const q = data.quote;
    if ($("checkout-subtotal")) $("checkout-subtotal").textContent = money(q.subtotalCents);
    if ($("checkout-discount")) $("checkout-discount").textContent = money(q.discountCents);
    if ($("checkout-shipping")) $("checkout-shipping").textContent = money(q.shippingFeeCents);
    if ($("checkout-cod-fee")) $("checkout-cod-fee").textContent = money(q.codFeeCents);
    if ($("cart-total")) $("cart-total").textContent = money(q.totalCents);
    if (data.couponError) showMessage(data.couponError, true);
  } catch {
    /* quote optional while typing */
  }
}

function renderStoreLogoPreview(logoUrl) {
  const wrap = $("store-logo-preview-wrap");
  const img = $("store-logo-preview");
  if (!wrap || !img) return;
  if (logoUrl) {
    img.src = logoUrl;
    wrap.hidden = false;
  } else {
    img.removeAttribute("src");
    wrap.hidden = true;
  }
}

function renderMerchantBrand(store) {
  if (!store) return;
  const name = store.name_ar || store.name_en || "إدارة المتجر";
  if ($("merchant-brand-name")) $("merchant-brand-name").textContent = name;
  if ($("merchant-brand-slug")) $("merchant-brand-slug").textContent = store.slug ? `@${store.slug}` : "";
  const serialEl = $("merchant-brand-serial");
  if (serialEl) {
    const serial = store.serial_code || "";
    serialEl.textContent = serial ? `رقم تسلسلي: ${serial}` : "";
    serialEl.hidden = !serial;
    if (serial) {
      localStorage.setItem("easyShopeStoreSerial", serial);
      updateLoginSerialDisplay(serial);
    }
  }
  const logoWrap = $("merchant-brand-logo-wrap");
  const logoImg = $("merchant-brand-logo");
  if (logoWrap && logoImg) {
    if (store.logo_url) {
      logoImg.src = store.logo_url;
      logoWrap.hidden = false;
    } else {
      logoImg.removeAttribute("src");
      logoWrap.hidden = true;
    }
  }
  updateMerchantMobileChrome(
    document.querySelector(".merchant-side-item.active")?.dataset.merchantTab || "overview",
  );
}

function updateThemePickerUi() {
  document.querySelectorAll(".theme-card").forEach((card) => {
    const id = card.querySelector(".theme-tile-select")?.dataset.storefrontTheme;
    card.classList.toggle("is-selected", id === state.storefrontThemeDraft);
  });
  document.querySelectorAll(".theme-tile-select[data-storefront-theme]").forEach((button) => {
    const on = button.dataset.storefrontTheme === state.storefrontThemeDraft;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
  if ($("theme-selected")) {
    $("theme-selected").textContent = `معاينة القالب: ${STOREFRONT_THEME_LABELS[state.storefrontThemeDraft] || state.storefrontThemeDraft}`;
  }
  const unsaved = state.storefrontThemeDraft !== state.savedStorefrontTheme;
  if ($("theme-unsaved-hint")) $("theme-unsaved-hint").hidden = !unsaved;
  updateAndroidThemeBridge();
}

function updateAndroidThemeBridge() {
  const el = $("android-theme-bridge");
  if (!el) return;
  const saved = state.savedStorefrontTheme || "ocean";
  const draft = state.storefrontThemeDraft || saved;
  const savedLabel = STOREFRONT_THEME_LABELS[saved] || saved;
  const warn =
    draft !== saved
      ? ` <strong class="theme-bridge-warn">تنبيه:</strong> المعاينة الحالية (${STOREFRONT_THEME_LABELS[draft] || draft}) لم تُحفظ — اضغط «حفظ القالب» في الإعدادات قبل بناء الـ APK.`
      : "";
  el.innerHTML = `<p><strong>قالب الواجهة المرتبط بالـ APK</strong></p><p class="muted">يُستخدم عند البناء القالب <strong>المحفوظ</strong> حاليًا: ${savedLabel} — يُمرَّر إلى Flutter كـ <code>STOREFRONT_THEME</code> مع <code>TENANT_SLUG</code>.${warn}</p>`;
}

function openThemePreview(themeId) {
  const card = document.querySelector(`.theme-card .theme-tile-select[data-storefront-theme="${themeId}"]`)?.closest(".theme-card");
  const vit = card?.querySelector(".theme-vitrine");
  const dlg = $("theme-preview-dialog");
  const mount = $("theme-preview-mount");
  const title = $("theme-preview-title");
  if (!vit || !dlg || !mount) return;
  mount.innerHTML = "";
  const clone = vit.cloneNode(true);
  clone.classList.add("theme-vitrine--dialog-clone");
  clone.removeAttribute("aria-hidden");
  mount.appendChild(clone);
  if (title) title.textContent = `معاينة — ${STOREFRONT_THEME_LABELS[themeId] || themeId}`;
  if (typeof dlg.showModal === "function") dlg.showModal();
}

function initThemeLibraryFilters() {
  const chipRoot = document.getElementById("theme-filter-chips");
  const grid = document.getElementById("theme-grid");
  if (!chipRoot || !grid) return;
  const tiles = grid.querySelectorAll(".theme-card[data-theme-tags]");
  chipRoot.querySelectorAll("[data-theme-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      chipRoot.querySelectorAll("[data-theme-filter]").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const filter = chip.dataset.themeFilter || "all";
      tiles.forEach((tile) => {
        const tags = (tile.dataset.themeTags || "")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const match = filter === "all" || tags.includes(filter);
        tile.classList.toggle("theme-tile-filtered-out", !match);
      });
    });
  });
}

async function saveStorefrontTheme() {
  await api("/api/merchant/store", { method: "PATCH", body: JSON.stringify({ storefrontTheme: state.storefrontThemeDraft }) });
  state.savedStorefrontTheme = state.storefrontThemeDraft;
  showMessage("تم حفظ قالب واجهة المتجر. سيُستخدم في الويب وتطبيق الأندرويد عند البناء.");
  updateThemePickerUi();
  await loadMerchantData();
  if (state.tenantSlug) await loadStorefront();
}

async function saveCheckoutProvider() {
  const value = $("checkout-provider")?.value || "paymob";
  await api("/api/merchant/store", { method: "PATCH", body: JSON.stringify({ checkoutProvider: value }) });
  showMessage("تم حفظ طريقة الدفع الافتراضية.");
  await loadMerchantData();
}

async function saveEasyCash(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  payload.enabled = payload.enabled === "on";
  await api("/api/merchant/payment-providers/easycash", { method: "POST", body: JSON.stringify(payload) });
  showMessage("تم حفظ إعدادات EasyCash بشكل مبدئي.");
  await loadMerchantData();
}

async function savePaymob(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim()));
  payload.enabled = payload.enabled === "on";
  if (payload.cardIntegrationId) payload.cardIntegrationId = Number(payload.cardIntegrationId);
  if (payload.walletIntegrationId) payload.walletIntegrationId = Number(payload.walletIntegrationId);
  else delete payload.walletIntegrationId;
  await api("/api/merchant/payment-providers/paymob", { method: "POST", body: JSON.stringify(payload) });
  showMessage("تم حفظ إعدادات Paymob.");
  await loadMerchantData();
}

async function testPaymob() {
  const data = await api("/api/merchant/payment-providers/paymob/test", { method: "POST", body: JSON.stringify({}) });
  showMessage(data.ok ? "اتصال Paymob ناجح — جاهز لاستقبال مدفوعات المتجر." : "فشل اختبار Paymob.", !data.ok);
  await loadMerchantData();
}

async function savePlatformPaymob(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim()));
  payload.enabled = payload.enabled === "on";
  if (payload.cardIntegrationId) payload.cardIntegrationId = Number(payload.cardIntegrationId);
  if (payload.walletIntegrationId) payload.walletIntegrationId = Number(payload.walletIntegrationId);
  else delete payload.walletIntegrationId;
  await api("/api/admin/payment-providers/paymob", { method: "POST", body: JSON.stringify(payload) });
  showMessage("تم حفظ Paymob الخاص بالمنصة.");
  await loadAdmin();
}

async function savePlatformTrialSettings(event) {
  event.preventDefault();
  const days = Number($("platform-trial-days")?.value || 30);
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    showMessage("أدخل عدد أيام بين 1 و 365.", true);
    return;
  }
  await api("/api/admin/platform-settings", { method: "PATCH", body: JSON.stringify({ trialDaysDefault: days }) });
  showMessage(`تم حفظ مدة التجربة: ${days} يومًا لكل تسجيل جديد.`);
  await loadAdmin();
}

async function testPlatformPaymob() {
  const data = await api("/api/admin/payment-providers/paymob/test", { method: "POST", body: JSON.stringify({}) });
  showMessage(data.ok ? "اتصال Paymob للمنصة ناجح — جاهز لتحصيل اشتراكات التجار." : "فشل اختبار Paymob.", !data.ok);
  await loadAdmin();
}

async function createSubscriptionInvoice(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  try {
    button.disabled = true;
    button.textContent = "جارٍ إنشاء الفاتورة...";
    $("subscription-status").innerHTML = "<strong>جارٍ إنشاء الفاتورة</strong><p>نجهز فاتورة الاشتراك الآن.</p>";
    if (!$("planCode").value) {
      await loadPlans();
    }
    if (!$("planCode").value) {
      throw new Error("لا توجد خطط اشتراك متاحة حاليًا. جرّب تحديث الصفحة أو راجع السوبر أدمن.");
    }
    const form = new FormData(event.currentTarget);
    const data = await api("/api/merchant/subscription-invoices", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
    showMessage(`تم إنشاء فاتورة اشتراك: ${data.invoice.id}`);
    $("subscription-status").innerHTML = `<strong>تم إنشاء الفاتورة</strong><p>رقم الفاتورة: ${data.invoice.id}</p><p>اضغط زر دفع Paymob من قائمة الفواتير بالأسفل.</p>`;
    await loadBillingData();
  } catch (error) {
    showMessage(error.message, true);
    $("subscription-status").innerHTML = `<strong>تعذر إنشاء الفاتورة</strong><p>${error.message}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = "إنشاء فاتورة اشتراك";
  }
}

async function loadPlans() {
  const plans = await api("/api/plans");
  state.merchantPlans = plans.plans || [];
  renderSubscriptionPlanCards(state.merchantPlans, $("planCode")?.value);
}

async function loadMerchantData() {
  if (!state.token || !state.tenantSlug || ["platform_owner", "platform_admin"].includes(state.role)) return;
  let dashboard;
  let billingInvoices = [];
  try {
    const [dash, categories, products, orders, providers, billing] = await Promise.all([
      api("/api/merchant/dashboard"),
      api("/api/merchant/categories"),
      api("/api/merchant/products"),
      api("/api/merchant/orders"),
      api("/api/merchant/payment-providers"),
      api("/api/merchant/subscription-invoices"),
    ]);
    dashboard = dash;
    billingInvoices = billing.invoices || [];
    state.merchantCategories = categories.categories || [];
    state.merchantProducts = products.products || [];
    state.merchantOrders = orders.orders || [];
    $("payment-providers").innerHTML =
      providers.providers
        .map(
          (item) =>
            `<li>
            <div class="provider-line">
              <strong>${item.provider}</strong>
              <span class="status-badge ${item.is_enabled ? "ok" : "off"}">${item.is_enabled ? "مفعّل" : "غير مفعّل"}</span>
            </div>
            <small>${item.mode}${item.provider === "paymob" ? ` • Card integration: ${item.public_config.cardIntegrationId || "-"}` : ""}</small>
          </li>`,
        )
        .join("") || "<li>لم يتم ربط دفع بعد.</li>";
    const paymobProvider = providers.providers.find((p) => p.provider === "paymob");
    renderPaymobStatusPanel("merchant-paymob-status", paymobProvider, { scope: "merchant" });
    await loadPlans();
    renderBilling(dashboard.tenant, billingInvoices);
    bindMerchantActions("orders");
    await loadStaff();
  } catch (error) {
    showMessage(error.message, true);
    const el = $("overview-alerts");
    if (el) el.innerHTML = `<li>تعذر تحميل بيانات لوحة المتجر: ${error.message}</li>`;
    return;
  }

  $("merchant-products-total").textContent = dashboard.products.total;
  $("merchant-products-published").textContent = `${dashboard.products.published} منشور`;
  $("merchant-categories-total").textContent = dashboard.categories.total;
  $("merchant-orders-total").textContent = dashboard.revenue.count;
  $("merchant-revenue-total").textContent = money(dashboard.revenue.total_cents);
  $("catalog-products-total").textContent = dashboard.products.total;
  $("catalog-products-published").textContent = `${dashboard.products.published} منشور`;
  $("catalog-orders-total").textContent = dashboard.revenue.count;
  $("catalog-revenue-total").textContent = money(dashboard.revenue.total_cents);
  $("catalog-categories-total").textContent = dashboard.categories.total;
  const maxChartValue = Math.max(Number(dashboard.products.total || 0), Number(dashboard.revenue.count || 0), Number(dashboard.revenue.total_cents || 0) / 100, 1);
  $("chart-products-bar").style.setProperty("--value", `${Math.max(10, (Number(dashboard.products.total || 0) / maxChartValue) * 100)}%`);
  $("chart-orders-bar").style.setProperty("--value", `${Math.max(10, (Number(dashboard.revenue.count || 0) / maxChartValue) * 100)}%`);
  $("chart-revenue-bar").style.setProperty("--value", `${Math.max(10, ((Number(dashboard.revenue.total_cents || 0) / 100) / maxChartValue) * 100)}%`);
  fillStoreSettings(dashboard.tenant);
  renderShopWelcomeBanner(dashboard.tenant);
  const latestOrders = dashboard.latestOrders || [];
  const latestMarkup =
    latestOrders
      .map((order) => `<li><strong>${order.customer_name}</strong><span>${money(order.total_cents)} — ${statusBadge(order.status)}</span></li>`)
      .join("") ||
    "<li>لا توجد طلبات حديثة.</li>";
  if ($("merchant-latest-orders")) $("merchant-latest-orders").innerHTML = latestMarkup;

  renderOverviewAlerts(dashboard, billingInvoices);
  renderTrialBanner(dashboard.tenant);
  $("product-category").innerHTML =
    `<option value="">بدون تصنيف</option>` + state.merchantCategories.map((item) => `<option value="${item.id}">${item.name_ar}</option>`).join("");
  $("product-filter-category").innerHTML =
    `<option value="">كل الأصناف</option>` + state.merchantCategories.map((item) => `<option value="${item.id}">${item.name_ar}</option>`).join("");
  renderMerchantCategories();
  renderMerchantProducts();
  renderMerchantOrders();
  await loadAndroidBuildsOnly();
  applyMerchantPermissions();
}

/// إخفاء التبويبات غير المسموح بها للموظف، وإبقاء كل شيء لصاحب المتجر.
function applyMerchantPermissions() {
  let activeHidden = false;

  document.querySelectorAll(".merchant-side-item[data-merchant-tab]").forEach((button) => {
    const mainTab = button.dataset.merchantTab;
    const allowed = merchantMainTabAllowed(mainTab);
    button.hidden = !allowed;
    if (!allowed && button.classList.contains("active")) activeHidden = true;
  });

  document.querySelectorAll("[data-merchant-sub]").forEach((button) => {
    const sub = button.dataset.merchantSub;
    const allowed = merchantSubTabAllowed(sub);
    button.hidden = !allowed;
  });

  if (state.role === "merchant_staff") {
    $("subnav-account")?.querySelector('[data-merchant-sub="team"]')?.toggleAttribute("hidden", true);
  } else if (state.role === "merchant_owner") {
    $("subnav-account")?.querySelector('[data-merchant-sub="team"]')?.toggleAttribute("hidden", false);
  }

  if (activeHidden || !merchantMainTabAllowed(state.merchantMainTab || "overview")) {
    setMerchantTab("overview");
  } else if (!merchantSubTabAllowed(state.merchantPanel || "overview")) {
    setMerchantTab(state.merchantMainTab || "overview");
  }
}

function formatAndroidBuildStatus(status) {
  const map = { queued: "في الانتظار", running: "قيد البناء", succeeded: "نجح", failed: "فشل" };
  return map[status] || status;
}

function escapeHtmlText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAndroidIntegrationBanner() {
  const el = $("android-integration-banner");
  const btn = $("merchant-android-build-request");
  if (!el) return;
  const integ = state.androidIntegration;
  if (!integ) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  const ready = Boolean(integ.dispatchReady && integ.callbackReady);
  if (ready) {
    el.className = "hint-box android-integration-banner android-integration--ready";
    el.innerHTML =
      "<strong>خادم الـ API جاهز لاستقبال طلب البناء</strong><p class=\"muted\" style=\"margin:8px 0 0\">تأكد أيضًا من أسرار GitHub ومستودع Flutter كما في الإرشادات أدناه، ثم اضغط «طلب بناء APK جديد».</p>";
  } else {
    const parts = [];
    if (!integ.dispatchReady) parts.push("<code>GITHUB_ACTIONS_DISPATCH_TOKEN</code> و <code>GITHUB_REPOSITORY</code> في <code>.env</code> على خادم النشر");
    if (!integ.callbackReady) parts.push("<code>ANDROID_BUILD_CALLBACK_SECRET</code> في <code>.env</code> على خادم النشر");
    el.className = "hint-box android-integration-banner android-integration--blocked";
    el.innerHTML = `<strong>ضبط خادم الـ API غير مكتمل</strong><p class="muted" style="margin:8px 0 0">ينقص في ملف <code>.env</code> على خادم النشر: ${parts.join(" — ")}. بعد الحفظ أعد تشغيل حاوية الـ API. للقائمة الكاملة (أسرار GitHub ومستودع Flutter) راجع الصندوق التالي.</p>`;
  }
  if (btn && can("android", "create")) {
    btn.disabled = false;
    btn.classList.toggle("android-build-button--blocked", !ready);
    btn.title = ready
      ? "تشغيل مسار بناء APK على GitHub"
      : "ضبط الخادم ناقص — اضغط لعرض ما المطلوب في ملف .env (لن يُرسل طلبًا حتى يكتمل الضبط).";
  }
}

function renderMerchantAndroidBuilds() {
  const ul = $("merchant-android-builds");
  const btn = $("merchant-android-build-request");
  if (btn) {
    btn.hidden = !can("android", "create");
    btn.disabled = !can("android", "create");
  }
  renderAndroidIntegrationBanner();
  if (!ul) return;
  const rows = state.merchantAndroidBuilds || [];
  if (!rows.length) {
    ul.innerHTML = "<li>لا توجد عمليات بناء بعد.</li>";
    return;
  }
  ul.innerHTML = rows
    .map((row) => {
      const when = row.created_at ? new Date(row.created_at).toLocaleString("ar-EG") : "";
      const themeLabel = row.storefront_theme
        ? STOREFRONT_THEME_LABELS[row.storefront_theme] || row.storefront_theme
        : "";
      const themeMeta = themeLabel ? `<span class="muted">قالب: ${escapeHtmlText(themeLabel)}</span>` : "";
      const download = row.artifact_url
        ? `<a href="${row.artifact_url}" target="_blank" rel="noopener noreferrer">تحميل APK</a>`
        : "";
      const run = row.github_run_url ? `<a href="${row.github_run_url}" target="_blank" rel="noopener noreferrer">سجل GitHub</a>` : "";
      const meta = [download, run].filter(Boolean).join(" · ");
      const err = row.error_message ? `<div class="muted"><small>${escapeHtmlText(row.error_message)}</small></div>` : "";
      return `<li><div class="provider-line"><strong>${formatAndroidBuildStatus(row.status)}</strong><span>${when}</span></div>${themeMeta ? `<div>${themeMeta}</div>` : ""}${meta ? `<div>${meta}</div>` : ""}${err}</li>`;
    })
    .join("");
}

async function loadAndroidBuildsOnly() {
  if (!state.token || !["merchant_owner", "merchant_staff"].includes(state.role)) return;
  try {
    const data = await api("/api/merchant/android-builds");
    state.merchantAndroidBuilds = data.builds || [];
    state.androidIntegration = data.integration || null;
  } catch {
    state.merchantAndroidBuilds = [];
    state.androidIntegration = null;
  }
  renderMerchantAndroidBuilds();
}

async function requestMerchantAndroidBuild() {
  const btn = $("merchant-android-build-request");
  const integ = state.androidIntegration;
  if (!integ) {
    const msg =
      "تعذّر التحقق من ضبط الخادم (لا بيانات ربط). حدّث الصفحة. إذا استمرّ الأمر، مسؤول المنصة يضبط .env على السيرفر ثم يعيد تشغيل الـ API.";
    showMessage(msg, "warn");
    setAndroidBuildInlineFeedback(msg, "warn");
    return;
  }
  if (!integ.dispatchReady || !integ.callbackReady) {
    const missing = [];
    if (!integ.dispatchReady) {
      missing.push("GITHUB_ACTIONS_DISPATCH_TOKEN و GITHUB_REPOSITORY في .env على خادم النشر");
    }
    if (!integ.callbackReady) {
      missing.push("ANDROID_BUILD_CALLBACK_SECRET في .env على خادم النشر");
    }
    const msg = `لا يُرسل طلب البناء حتى يكتمل ضبط الخادم: ${missing.join(" — ")}. بعد الحفظ أعد تشغيل حاوية الـ API ثم حدّث الصفحة.`;
    showMessage(msg, "warn");
    setAndroidBuildInlineFeedback(msg, "warn");
    return;
  }
  const unsaved = state.storefrontThemeDraft && state.storefrontThemeDraft !== state.savedStorefrontTheme;
  if (unsaved) {
    try {
      await saveStorefrontTheme();
    } catch (error) {
      showMessage(error.message || "تعذّر حفظ القالب قبل البناء", true);
      return;
    }
  }
  const themeForBuild = state.savedStorefrontTheme || state.storefrontThemeDraft || "ocean";
  setAndroidBuildInlineFeedback("");
  try {
    if (btn) btn.disabled = true;
    await api("/api/merchant/android-build", {
      method: "POST",
      body: JSON.stringify({ storefrontTheme: themeForBuild }),
    });
    showMessage(`تم طلب بناء التطبيق بقالب ${STOREFRONT_THEME_LABELS[themeForBuild] || themeForBuild}. راقب القائمة أدناه حتى يكتمل المسار.`);
    setAndroidBuildInlineFeedback("تم إرسال الطلب — راقب القائمة أدناه.", "ok");
    await loadAndroidBuildsOnly();
  } catch (error) {
    if (error.statusCode === 503 && error.code === "android_build_not_configured") {
      const msg = error.message || "ضبط الخادم ناقص.";
      showMessage(msg, "warn");
      setAndroidBuildInlineFeedback(msg, "warn");
      await loadAndroidBuildsOnly();
    } else {
      const msg = error.message || "فشل الطلب";
      showMessage(msg, true);
      setAndroidBuildInlineFeedback(msg, "error");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderOverviewAlerts(dashboard, invoices) {
  const alerts = [];
  const tenant = dashboard?.tenant || {};
  const products = dashboard?.products || {};
  const categories = dashboard?.categories || {};
  const revenue = dashboard?.revenue || {};
  const openInvoices = (invoices || []).filter((inv) => inv.status !== "paid");
  const tStatus = tenant.status;

  if (tStatus === "suspended" || tStatus === "expired") {
    alerts.push("المتجر موقوف أو انتهى الاشتراك. راجع السوبر أدمن أو سدّد فاتورة المنصة.");
  } else if (tStatus === "trial") {
    const days = trialDaysRemaining(tenant.subscription_expires_at);
    if (days !== null && days > 0) {
      alerts.push(`أنت في التجربة المجانية — متبقي ${days} ${days === 1 ? "يوم" : "يوم"} (ينتهي ${formatTrialExpiryDate(tenant.subscription_expires_at)}).`);
    } else {
      alerts.push("فترة التجربة على وشك الانتهاء. ادفع اشتراك المنصة من «اشتراك المنصة».");
    }
    alerts.push("ابدأ بإضافة أصناف ومنتجات، ثم ادفع اشتراك المنصة عند الجاهزية.");
  } else if (tStatus && tStatus !== "active") {
    alerts.push("حالة المتجر تحتاج مراجعة من السوبر أدمن أو إكمال الاشتراك.");
  }
  if (!Number(categories.total || 0)) alerts.push("ابدأ بإضافة أول صنف لتنظيم الكتالوج.");
  if (!Number(products.total || 0)) alerts.push("أضف أول منتج ليظهر في واجهة المتجر.");
  if (Number(products.published || 0) === 0 && Number(products.total || 0) > 0) alerts.push("لديك منتجات غير منشورة. انشر المنتجات الجاهزة ليبدأ البيع.");
  if (openInvoices.length) alerts.push(`لديك ${openInvoices.length} فاتورة اشتراك غير مدفوعة.`);
  if (Number(revenue.count || 0) === 0) alerts.push("لا توجد طلبات بعد. شارك رابط واجهة المتجر لبدء استقبال الطلبات.");

  const el = $("overview-alerts");
  if (!el) return;
  el.innerHTML = (alerts.length ? alerts : ["كل شيء جاهز. تابع إضافة المنتجات وربط الدفع."]).map((text) => `<li>${text}</li>`).join("");
}

function renderMerchantOrders() {
  const tbody = $("orders-table");
  if (!tbody) return;
  const query = ($("orders-filter")?.value || "").trim().toLowerCase();
  const status = ($("orders-filter-status")?.value || "").trim();

  const rows = (state.merchantOrders || []).filter((order) => {
    const haystack = `${order.id} ${order.customer_name || ""} ${order.customer_phone || ""}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesStatus = !status || String(order.status) === status;
    return matchesQuery && matchesStatus;
  });

  tbody.innerHTML =
    rows
      .map((order) => {
        const created = order.created_at ? new Date(order.created_at).toLocaleString("ar-EG") : "-";
        const statusBadgeHtml = statusBadge(order.status);
        const payBadge = statusBadge(order.payment_status || "pending");
        return `<tr>
          <td><strong>${order.customer_name || "-"}</strong><br><small>${order.id}</small></td>
          <td>${money(order.total_cents)}</td>
          <td>${payBadge}</td>
          <td>${statusBadgeHtml}</td>
          <td><small>${created}</small></td>
          <td>
            <div class="row-actions">
              <button class="mini-button" data-order-details="${order.id}">تفاصيل</button>
              <button class="mini-button" data-order-status="${order.id}:processing">تجهيز</button>
              <button class="mini-button" data-order-status="${order.id}:shipped">شحن</button>
              <button class="mini-button success-button" data-order-status="${order.id}:delivered">تسليم</button>
              <button class="mini-button danger-button" data-order-status="${order.id}:cancelled">إلغاء</button>
            </div>
          </td>
        </tr>`;
      })
      .join("") ||
    (query || status
      ? `<tr><td colspan="6">لا توجد طلبات مطابقة.</td></tr>`
      : `<tr><td colspan="6">${emptyStateBlock({
          title: "لا توجد طلبات بعد",
          hint: "شارك رابط متجرك مع عملائك لبدء استقبال الطلبات.",
          actionLabel: "عرض روابط المتجر",
          actionId: "empty-goto-store-links",
        })}</td></tr>`);

  $("empty-goto-store-links")?.addEventListener("click", () => setMerchantTab("settings"));
  bindMerchantActions("orders");
}

function renderMerchantCategories() {
  const filter = $("category-filter")?.value.trim().toLowerCase() || "";
  const rows = state.merchantCategories.filter((item) => `${item.name_ar} ${item.name_en}`.toLowerCase().includes(filter));
  const table = $("categories-table");
  if (!table) return;
  const counts = new Map();
  (state.merchantProducts || []).forEach((product) => {
    if (!product.category_id) return;
    counts.set(product.category_id, (counts.get(product.category_id) || 0) + 1);
  });
  table.innerHTML =
    rows
      .map((item) => {
        const count = counts.get(item.id) || 0;
        return `<tr>
          <td><strong>${item.image_url ? `<img class="list-thumb" src="${item.image_url}" alt="">` : ""}${item.name_ar}<br><small>${item.name_en}</small></strong></td>
          <td><small>${item.slug}</small></td>
          <td><span class="status-badge">${count}</span></td>
          <td><div class="row-actions"><button class="mini-button" data-category-edit="${item.id}">تعديل</button><button class="mini-button danger-button" data-category-delete="${item.id}">حذف</button></div></td>
        </tr>`;
      })
      .join("") ||
    (filter
      ? `<tr><td colspan="4">لا توجد تصنيفات مطابقة.</td></tr>`
      : `<tr><td colspan="4">${emptyStateBlock({
          title: "لا توجد أصناف بعد",
          hint: "أنشئ أول صنف لتنظيم منتجاتك في واجهة المتجر.",
          actionLabel: "إضافة صنف",
          actionId: "empty-add-category",
        })}</td></tr>`);
  $("empty-add-category")?.addEventListener("click", openCategoryModal);
  document.querySelectorAll("[data-category-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const cat = state.merchantCategories.find((c) => c.id === button.dataset.categoryEdit);
      if (!cat) return;
      openAppModal({
        title: "تعديل الصنف",
        bodyHtml: `<form id="category-edit-form" class="form-stack"><label>اسم عربي<input name="nameAr" value="${cat.name_ar}" required></label><label>اسم إنجليزي<input name="nameEn" value="${cat.name_en}" required></label></form>`,
        footHtml: `<button type="button" class="secondary" id="cat-edit-cancel">إلغاء</button><button type="button" id="cat-edit-save">حفظ</button>`,
      });
      $("cat-edit-cancel")?.addEventListener("click", closeAppModal);
      $("cat-edit-save")?.addEventListener("click", async () => {
        const form = $("category-edit-form");
        const payload = Object.fromEntries(new FormData(form).entries());
        await api(`/api/merchant/categories/${cat.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showMessage("تم تحديث الصنف.");
        closeAppModal();
        await loadMerchantData();
      });
    });
  });
  document.querySelectorAll("[data-category-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("حذف هذا الصنف؟")) return;
      await api(`/api/merchant/categories/${button.dataset.categoryDelete}`, { method: "DELETE", body: JSON.stringify({}) });
      showMessage("تم حذف الصنف.");
      await loadMerchantData();
    });
  });
}

function renderMerchantProducts() {
  const query = $("product-filter")?.value.trim().toLowerCase() || "";
  const categoryId = $("product-filter-category")?.value || "";
  const status = $("product-filter-status")?.value || "";
  const categoryById = new Map(state.merchantCategories.map((category) => [category.id, category.name_ar]));
  const rows = state.merchantProducts.filter((item) => {
    const matchesQuery = `${item.title_ar} ${item.title_en} ${item.description || ""}`.toLowerCase().includes(query);
    const matchesCategory = !categoryId || item.category_id === categoryId;
    const matchesStatus = !status || item.status === status;
    return matchesQuery && matchesCategory && matchesStatus;
  });
  const tbody = $("products-table");
  if (!tbody) return;
  tbody.innerHTML =
    rows
      .map((item) => {
        const categoryName = categoryById.get(item.category_id) || "بدون تصنيف";
        const statusBadgeHtml = statusBadge(item.status);
        return `<tr>
          <td><input type="checkbox" class="product-select" data-product-select="${item.id}"></td>
          <td><strong>${item.image_url ? `<img class="list-thumb" src="${item.image_url}" alt="">` : ""}${item.title_ar}<br><small>${item.title_en || ""}</small></strong></td>
          <td>${money(item.price_cents)}${item.discount_percent ? ` <small class="discount-badge">خصم ${item.discount_percent}%</small>` : ""}</td>
          <td><small>${item.stock_quantity}</small></td>
          <td><small>${categoryName}</small></td>
          <td>${statusBadgeHtml}</td>
          <td>
            <div class="row-actions">
              <button class="mini-button" data-product-edit="${item.id}">تعديل</button>
              <button class="mini-button" data-product-status="${item.id}:${item.status === "published" ? "draft" : "published"}">${item.status === "published" ? "إخفاء" : "نشر"}</button>
              <button class="mini-button danger-button" data-product-delete="${item.id}">حذف</button>
            </div>
          </td>
        </tr>`;
      })
      .join("") ||
    (query || categoryId || status
      ? `<tr><td colspan="7">لا توجد منتجات مطابقة.</td></tr>`
      : `<tr><td colspan="7">${emptyStateBlock({
          title: "لا توجد منتجات بعد",
          hint: "أضف أول منتج ليظهر في متجرك وتطبيق الأندرويد.",
          actionLabel: "إضافة منتج",
          actionId: "empty-add-product",
        })}</td></tr>`);

  $("empty-add-product")?.addEventListener("click", () => openProductWizard(1, { reset: true }));
  bindMerchantActions("products");
}

async function loadStaff() {
  const staffList = $("staff-list");
  if (!staffList) return;
  if (state.role !== "merchant_owner") {
    staffList.innerHTML = "<li>إدارة الموظفين متاحة لصاحب المتجر فقط.</li>";
    $("staff-form")?.querySelectorAll("input, button, select").forEach((element) => {
      element.disabled = true;
    });
    return;
  }
  $("staff-form")?.querySelectorAll("input, button, select").forEach((element) => {
    element.disabled = false;
  });
  const data = await api("/api/merchant/staff");
  state.staffRoles = data.roles || [];
  state.permissionModules = data.modules || [];
  fillStaffRoleSelects(data.roles || []);
  const linkBox = $("staff-login-link");
  if (linkBox && data.staffLoginUrl) {
    linkBox.hidden = false;
    linkBox.innerHTML = `<strong>رابط دخول الموظفين</strong><p class="store-link-url">${data.staffLoginUrl}</p><button type="button" class="secondary" id="copy-staff-login-url">نسخ الرابط</button>`;
    $("copy-staff-login-url")?.addEventListener("click", () => {
      navigator.clipboard?.writeText(data.staffLoginUrl);
      showMessage("تم نسخ رابط الدخول.");
    });
  }
  const filter = ($("staff-filter")?.value || "").trim().toLowerCase();
  const rows = (data.staff || []).filter((m) => {
    if (!filter) return true;
    return `${m.name} ${m.email} ${m.job_title || ""}`.toLowerCase().includes(filter);
  });
  staffList.innerHTML =
    rows.map((member) => renderStaffRow(member, data.roles || [])).join("") || "<li>لا يوجد موظفون مطابقون.</li>";
  fillOverrideUserSelect(data.staff || []);
  bindStaffActions();
  void loadRoleMatrix();
}

function staffRoleLabel(roleId, roles = state.staffRoles || []) {
  return roles.find((r) => r.id === roleId)?.labelAr || roleId || "—";
}

function fillStaffRoleSelects(roles) {
  const html = roles.map((r) => `<option value="${r.id}">${r.labelAr}</option>`).join("");
  $("staff-role-select") && ($("staff-role-select").innerHTML = html);
  $("role-matrix-select") && ($("role-matrix-select").innerHTML = html);
}

function fillOverrideUserSelect(staff) {
  const sel = $("override-user-select");
  if (!sel) return;
  sel.innerHTML = staff.map((m) => `<option value="${m.id}">${m.name} (${staffRoleLabel(m.staff_role)})</option>`).join("") || `<option value="">لا يوجد موظفون</option>`;
}

function renderPermissionMatrix(container, permissions, prefix = "perm") {
  if (!container) return;
  const modules = state.permissionModules?.length
    ? state.permissionModules
    : [
        { id: "orders", labelAr: "الطلبات", group: "المبيعات" },
        { id: "products", labelAr: "المنتجات", group: "الكتالوج" },
      ];
  const groups = [...new Set(modules.map((m) => m.group))];
  container.innerHTML = groups
    .map((group) => {
      const mods = modules.filter((m) => m.group === group);
      return `<div class="perm-matrix-group"><strong>${group}</strong><table class="data-table perm-matrix-table"><thead><tr><th>القسم</th>${Object.entries(PERMISSION_ACTION_LABELS)
        .map(([k, v]) => `<th>${v}</th>`)
        .join("")}</tr></thead><tbody>${mods
        .map((mod) => {
          const row = permissions?.[mod.id] || {};
          return `<tr><td>${mod.labelAr}</td>${["view", "create", "edit", "delete"]
            .map(
              (action) =>
                `<td><input type="checkbox" data-${prefix}-module="${mod.id}" data-${prefix}-action="${action}"${row[action] ? " checked" : ""}></td>`,
            )
            .join("")}</tr>`;
        })
        .join("")}</tbody></table></div>`;
    })
    .join("");
}

function readMatrixFromDom(container, prefix) {
  const out = {};
  container?.querySelectorAll(`input[data-${prefix}-module]`).forEach((input) => {
    const mod = input.getAttribute(`data-${prefix}-module`);
    const action = input.getAttribute(`data-${prefix}-action`);
    if (!mod || !action) return;
    out[mod] = out[mod] || { view: false, create: false, edit: false, delete: false };
    out[mod][action] = input.checked;
  });
  return out;
}

async function loadRoleMatrix() {
  const role = $("role-matrix-select")?.value || "viewer";
  if (!role || state.role !== "merchant_owner") return;
  try {
    const data = await api("/api/merchant/permissions/roles");
    state.permissionModules = data.modules || state.permissionModules;
    const entry = (data.matrix || []).find((r) => r.role === role);
    state.roleMatrixDraft = entry?.permissions || {};
    renderPermissionMatrix($("role-permissions-matrix"), state.roleMatrixDraft, "role");
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadUserOverrides() {
  const userId = $("override-user-select")?.value;
  if (!userId) return;
  try {
    const data = await api(`/api/merchant/permissions/users/${userId}/overrides`);
    state.permissionModules = data.modules || state.permissionModules;
    const merged = { ...(data.rolePermissions || {}) };
    (data.overrides || []).forEach((row) => {
      merged[row.module] = {
        view: row.can_view ?? merged[row.module]?.view ?? false,
        create: row.can_create ?? merged[row.module]?.create ?? false,
        edit: row.can_edit ?? merged[row.module]?.edit ?? false,
        delete: row.can_delete ?? merged[row.module]?.delete ?? false,
      };
    });
    state.overrideDraft = merged;
    renderPermissionMatrix($("user-overrides-matrix"), merged, "user");
  } catch (error) {
    showMessage(error.message, true);
  }
}

function setTeamTab(tab) {
  document.querySelectorAll("[data-team-tab]").forEach((btn) => btn.classList.toggle("active", btn.dataset.teamTab === tab));
  $("team-panel-users")?.toggleAttribute("hidden", tab !== "users");
  $("team-panel-roles")?.toggleAttribute("hidden", tab !== "roles");
  $("team-panel-overrides")?.toggleAttribute("hidden", tab !== "overrides");
  if (tab === "roles") void loadRoleMatrix();
  if (tab === "overrides") void loadUserOverrides();
}

function renderStaffRow(member, roles = []) {
  const roleLabel = staffRoleLabel(member.staff_role, roles);
  return `<li class="staff-row" data-staff-id="${member.id}">
      <div class="provider-line">
        <strong>${escapeHtmlText(member.name)}<br><small>${escapeHtmlText(member.email)}${member.phone ? ` • ${escapeHtmlText(member.phone)}` : ""}</small></strong>
        <span class="status-badge ${member.status === "active" ? "ok" : "off"}">${member.status === "active" ? "نشط" : "معطّل"}</span>
      </div>
      <div class="perm-badges"><span class="perm-badge">${escapeHtmlText(roleLabel)}</span>${member.job_title ? `<span class="perm-badge">${escapeHtmlText(member.job_title)}</span>` : ""}</div>
      <span class="row-actions">
        <button class="mini-button" data-staff-reset="${member.id}">إعادة كلمة المرور</button>
        <button class="mini-button" data-staff-status="${member.id}:${member.status === "active" ? "disabled" : "active"}">${member.status === "active" ? "تعطيل" : "تفعيل"}</button>
        <button class="mini-button danger-button" data-staff-delete="${member.id}">حذف</button>
      </span>
    </li>`;
}

function bindStaffActions() {
  document.querySelectorAll("[data-staff-reset]").forEach((button) => {
    button.addEventListener("click", async () => {
      const pwd = prompt("كلمة المرور الجديدة (8 أحرف على الأقل):");
      if (!pwd || pwd.length < 8) return showMessage("كلمة المرور قصيرة.", true);
      await api(`/api/merchant/staff/${button.dataset.staffReset}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: pwd }),
      });
      showMessage("تم تحديث كلمة مرور الموظف.");
    });
  });
  document.querySelectorAll("[data-staff-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [staffId, status] = button.dataset.staffStatus.split(":");
      await api(`/api/merchant/staff/${staffId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      showMessage("تم تحديث حالة الموظف.");
      await loadStaff();
    });
  });
  document.querySelectorAll("[data-staff-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("هل تريد حذف هذا الموظف؟")) return;
      await api(`/api/merchant/staff/${button.dataset.staffDelete}`, { method: "DELETE", body: JSON.stringify({}) });
      showMessage("تم حذف الموظف.");
      await loadStaff();
    });
  });
}

function bindMerchantActions(scope = "all") {
  if (scope === "all" || scope === "products") {
    document.querySelectorAll("[data-product-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        const [productId, status] = button.dataset.productStatus.split(":");
        await api(`/api/merchant/products/${productId}`, { method: "PATCH", body: JSON.stringify({ status }) });
        showMessage(status === "published" ? "تم نشر المنتج." : "تم إخفاء المنتج.");
        await loadMerchantData();
        if (state.tenantSlug) await loadStorefront();
      });
    });
    document.querySelectorAll("[data-product-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("هل تريد حذف المنتج؟")) return;
        await api(`/api/merchant/products/${button.dataset.productDelete}`, { method: "DELETE", body: JSON.stringify({}) });
        showMessage("تم حذف المنتج.");
        await loadMerchantData();
        if (state.tenantSlug) await loadStorefront();
      });
    });
    document.querySelectorAll("[data-product-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        const product = state.merchantProducts.find((p) => p.id === button.dataset.productEdit);
        if (product) openProductEdit(product);
      });
    });
  }
  if (scope === "products") return;
  document.querySelectorAll("[data-order-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [orderId, status] = button.dataset.orderStatus.split(":");
      const payload = { status };
      if (status === "shipped") {
        const trackingNumber = prompt("رقم الشحنة (اختياري):")?.trim();
        if (trackingNumber) {
          payload.trackingNumber = trackingNumber;
          payload.carrierCode = state.storeSettings?.defaultCarrier || "manual";
        }
      }
      await api(`/api/merchant/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify(payload) });
      showMessage(`تم تحديث الطلب إلى ${orderStatusLabel(status)}.`);
      await loadMerchantData();
    });
  });
  document.querySelectorAll("[data-order-details]").forEach((button) => {
    button.addEventListener("click", async () => {
      const data = await api(`/api/merchant/orders/${button.dataset.orderDetails}`);
      const dialog = $("order-dialog");
      const title = $("order-dialog-title");
      const body = $("order-dialog-body");
      if (!dialog || !title || !body) return;
      const order = data.order;
      const slug = state.tenantSlug || $("tenant-slug")?.value?.trim() || "";
      const trackingUrl = order.tracking_token && slug ? `${window.location.origin}/store/${slug}/track/${order.tracking_token}` : "";
      const carrierUrl = order.tracking_number
        ? order.carrier_code === "bosta"
          ? `https://bosta.co/tracking-shipments?shipmentNumber=${encodeURIComponent(order.tracking_number)}`
          : order.carrier_code === "aramex"
            ? `https://www.aramex.com/track/results?ShipmentNumber=${encodeURIComponent(order.tracking_number)}`
            : null
        : null;
      title.textContent = `طلب ${order.id}`;
      body.innerHTML = `
        <div class="dialog-grid">
          <div class="hint-box"><strong>العميل</strong><p>${order.customer_name || "-"}</p><small>${order.customer_phone || ""}</small></div>
          <div class="hint-box"><strong>الإجمالي</strong><p>${money(order.total_cents)}</p><small>الدفع: ${order.payment_status || "-"} · ${orderStatusLabel(order.status)}</small></div>
        </div>
        <div class="hint-box"><strong>العناصر</strong><p>${data.items
          .map((item) => `${item.title} × ${item.quantity} = ${money(item.total_cents)}`)
          .join("<br>")}</p></div>
        <form id="order-shipping-form" class="form-stack">
          <label>رقم الشحنة<input name="trackingNumber" value="${escapeHtmlText(order.tracking_number || "")}"></label>
          <label>شركة الشحن
            <select name="carrierCode">
              <option value="manual"${order.carrier_code === "manual" || !order.carrier_code ? " selected" : ""}>يدوي</option>
              <option value="bosta"${order.carrier_code === "bosta" ? " selected" : ""}>Bosta</option>
              <option value="aramex"${order.carrier_code === "aramex" ? " selected" : ""}>Aramex</option>
            </select>
          </label>
          <button type="submit">حفظ بيانات الشحن</button>
        </form>
        ${trackingUrl ? `<p class="hint-inline"><a href="${trackingUrl}" target="_blank" rel="noopener">رابط متابعة للعميل</a></p>` : ""}
        ${carrierUrl ? `<p class="hint-inline"><a href="${carrierUrl}" target="_blank" rel="noopener">تتبع على موقع الشركة</a></p>` : ""}
      `;
      $("order-shipping-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        await api(`/api/merchant/orders/${order.id}/shipping`, {
          method: "PATCH",
          body: JSON.stringify({
            trackingNumber: fd.get("trackingNumber") || undefined,
            carrierCode: fd.get("carrierCode") || "manual",
          }),
        });
        showMessage("تم حفظ بيانات الشحن.");
        dialog.close();
        await loadMerchantData();
      });
      dialog.showModal();
    });
  });
}

function applyMobileStoreClientShell() {
  applyStoreClientShell();
}

function updateStoreClientBranding(store, categories = []) {
  const name = store.name_ar || store.name_en || "المتجر";
  const tagline = storeClientTagline(store, categories);
  document.title = `${name} — متجر`;
  const clientTitle = $("storefront-client-title");
  const clientTagline = $("storefront-client-tagline");
  if (clientTitle) clientTitle.textContent = name;
  if (clientTagline) clientTagline.textContent = tagline;
  const logoWrap = $("store-hero-logo-wrap");
  const logoImg = $("store-hero-logo");
  const logoFallback = $("store-hero-logo-fallback");
  const initial = name.trim().slice(0, 1) || "م";
  if (store.logo_url && logoImg && logoWrap) {
    logoImg.src = store.logo_url;
    logoImg.alt = name;
    logoWrap.hidden = false;
    if (logoFallback) logoFallback.hidden = true;
  } else if (logoFallback) {
    logoFallback.textContent = initial;
    logoFallback.hidden = false;
    if (logoWrap) logoWrap.hidden = true;
  }
  if (store.brand_color) {
    document.documentElement.style.setProperty("--store-accent", store.brand_color);
  }
}

async function applyStoreDeepLink() {
  const slug = getStoreSlugFromUrl();
  if (!slug) return;
  applyStoreClientShell();
  const input = $("tenant-slug");
  if (input) input.value = slug;
  state.tenantSlug = slug;
  try {
    setView("storefront");
    await loadStorefront();
    const token = getTrackTokenFromUrl();
    if (token) await loadPublicTrackByToken(slug, token);
    else if (isStoreClientMode()) $("store-track-section")?.removeAttribute("hidden");
  } catch (error) {
    showMessage(error.message || String(error), true);
  }
}

function renderTrackResult(data, container) {
  if (!container || !data?.order) return;
  const o = data.order;
  const items = (o.items || []).map((item) => `${item.title} × ${item.quantity}`).join("<br>");
  container.innerHTML = `
    <div class="hint-box">
      <strong>حالة الطلب: ${orderStatusLabel(o.status)}</strong>
      <p>رقم الطلب: ${o.id}</p>
      <p>الإجمالي: ${money(o.totalCents)}</p>
      ${o.trackingNumber ? `<p>رقم الشحنة: ${escapeHtmlText(o.trackingNumber)}</p>` : ""}
      ${items ? `<p>${items}</p>` : ""}
      ${o.carrierTrackingUrl ? `<p><a class="button" href="${o.carrierTrackingUrl}" target="_blank" rel="noopener">تتبع على موقع الشحن</a></p>` : ""}
    </div>`;
}

async function loadPublicTrackByToken(slug, token) {
  const data = await api(`/api/store/${slug}/track/${token}`);
  renderTrackResult(data, $("store-track-result"));
  $("store-track-section")?.removeAttribute("hidden");
  setStoreAccountOpen(true);
}

async function submitStoreTrack(event, resultEl) {
  event.preventDefault();
  const slug = $("tenant-slug")?.value?.trim() || getStoreSlugFromUrl();
  if (!slug) return showMessage("حمّل المتجر أولًا.", true);
  const fd = new FormData(event.currentTarget);
  try {
    const data = await api(`/api/store/${slug}/track`, {
      method: "POST",
      body: JSON.stringify({ orderId: fd.get("orderId"), phone: fd.get("phone") }),
    });
    renderTrackResult(data, resultEl || $("store-track-result"));
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadStorefront(event) {
  event?.preventDefault();
  const slug = $("tenant-slug").value.trim();
  if (!slug) {
    $("storefront-products").innerHTML = "<p>بعد تسجيل التاجر سيظهر معرف المتجر هنا تلقائيًا.</p>";
    const bar = $("storefront-chrome-bar");
    const rail = $("storefront-category-rail");
    const bottom = $("storefront-bottom-nav");
    const pills = $("storefront-categories");
    if (bar) {
      bar.hidden = true;
      bar.innerHTML = "";
    }
    if (rail) {
      rail.hidden = true;
      rail.innerHTML = "";
    }
    if (bottom) {
      bottom.hidden = true;
      bottom.innerHTML = "";
    }
    if (pills) {
      pills.hidden = false;
      pills.innerHTML = "";
    }
    return;
  }
  state.tenantSlug = slug;
  localStorage.setItem("easyShopeTenantSlug", slug);
  const store = await api(`/api/store/${slug}`);
  state.storeTenantId = store.store.id || "";
  state.merchantCategories = store.categories || [];
  state.checkoutConfig = store.checkout || null;
  injectStoreTracking(store.checkout);
  renderCheckoutGovernorates(store.checkout);
  renderCheckoutPaymentMethods(store.checkout);
  const theme = store.store.storefront_theme || "ocean";
  const layout = normalizeStorefrontLayout(theme);
  document.body.dataset.theme = theme;
  const shell = $("storefront-shell");
  if (shell) shell.dataset.storefrontLayout = layout;
  if (isStoreClientMode()) updateStoreClientBranding(store.store, store.categories);
  renderStorefrontChrome(layout, store.store, store.categories);
  const data = await api(`/api/store/${slug}/products${queryString({ q: $("storefront-query").value.trim(), category: state.storefrontCategory })}`);
  const storeName = store.store.name_ar || store.store.name_en;
  $("storefront-title").textContent = storeName;
  const clientMode = isStoreClientMode();
  if (clientMode) {
    $("storefront-subtitle").textContent = storeClientTagline(store.store, store.categories);
    const activeCategory = store.categories.find((c) => c.slug === state.storefrontCategory);
    const productsTitle = $("store-products-title");
    const productsCount = $("store-products-count");
    if (productsTitle) productsTitle.textContent = activeCategory ? activeCategory.name_ar : "كل المنتجات";
    if (productsCount) {
      const count = data.products.length;
      productsCount.textContent = count ? `${count} ${count === 1 ? "منتج" : "منتجات"}` : "لا توجد منتجات في هذا القسم حاليًا";
    }
  } else {
    $("storefront-subtitle").textContent = `${store.store.name_en} - ${store.store.country} - ${store.store.status}`;
  }
  renderStorefrontStories(store.categories, layout);
  renderStorefrontSpotlight(store.store, data.products, layout);
  if (clientMode) {
    renderStoreCategorySlider(store.categories);
    const pills = $("storefront-categories");
    if (pills) {
      pills.hidden = true;
      pills.innerHTML = "";
    }
    const bar = $("storefront-chrome-bar");
    if (bar) bar.hidden = true;
    $("storefront-products").classList.add("store-client-product-grid");
    $("storefront-products").innerHTML =
      data.products.map((item) => storefrontClientProductHtml(item)).join("") ||
      `<div class="store-empty-state"><strong>لا توجد منتجات بعد</strong><p>تابعنا قريبًا — سيُضاف محتوى جديد إلى المتجر.</p></div>`;
  } else {
    const slider = $("store-category-slider");
    if (slider) {
      slider.hidden = true;
      slider.innerHTML = "";
    }
    $("storefront-products").classList.remove("store-client-product-grid");
    $("storefront-products").innerHTML =
      data.products.map((item) => storefrontProductHtml(item, layout)).join("") ||
      "<p>لا توجد منتجات منشورة في هذا المتجر.</p>";
  }
}

async function placeOrder(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const slug = $("tenant-slug").value.trim();
  const items = state.cart.map((item) => ({ productId: item.productId, quantity: item.quantity }));
  if (!items.length) return showMessage("اختر منتجًا واحدًا على الأقل.", true);
  const payload = {
    customerName: form.get("customerName"),
    customerPhone: form.get("customerPhone"),
    customerEmail: form.get("customerEmail") || undefined,
    shippingAddress: form.get("shippingAddress") || undefined,
    governorate: form.get("governorate") || undefined,
    paymentMethod: form.get("paymentMethod") || "paymob",
    couponCode: form.get("couponCode") || undefined,
    items,
  };
  const data = await api(`/api/store/${slug}/orders`, { method: "POST", body: JSON.stringify(payload) });
  const payMsg = data.payment?.message || data.payment?.status || "";
  const trackLink = data.trackingUrl ? `<p><a class="button secondary" href="${data.trackingUrl}">متابعة الطلب</a></p>` : "";
  showMessage(`تم إنشاء الطلب: ${data.order.id}`);
  $("checkout-result").innerHTML = `<strong>تم إنشاء الطلب بنجاح</strong><p>رقم الطلب: ${data.order.id}</p><p>حالة الدفع: ${data.payment.status}</p>${payMsg ? `<p>${payMsg}</p>` : ""}${
    data.payment.checkoutUrl ? `<p><a class="button" href="${data.payment.checkoutUrl}" target="_blank" rel="noopener">ادفع الآن عبر Paymob</a></p>` : ""
  }${trackLink}`;
  state.cart = [];
  renderCart();
  if (!["platform_owner", "platform_admin"].includes(state.role)) await loadMerchantData();
}

async function registerCustomer(event) {
  event.preventDefault();
  const slug = $("tenant-slug").value.trim();
  if (!slug) return showMessage("حمّل المتجر أولًا قبل إنشاء حساب عميل.", true);
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim()));
  try {
    const data = await api(`/api/store/${slug}/customers/register`, { method: "POST", body: JSON.stringify(payload) });
    state.customerToken = data.token;
    localStorage.setItem("easyShopeCustomerToken", state.customerToken);
    showMessage("تم إنشاء حساب العميل.");
    await loadCustomerOrders();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loginCustomer(event) {
  event.preventDefault();
  const slug = $("tenant-slug").value.trim();
  if (!slug) return showMessage("حمّل المتجر أولًا.", true);
  if (!state.storeTenantId) return showMessage("انتظر تحميل بيانات المتجر ثم أعد المحاولة.", true);
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const raw = Object.fromEntries(new FormData(form).entries());
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "جارٍ الدخول...";
    }
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(raw.email || "").trim().toLowerCase(), password: raw.password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "تعذر تسجيل الدخول");
    if (data.user.role !== "customer") {
      throw new Error("هذا الحساب ليس عميلًا. لتسجيل دخول التاجر استخدم الموقع من المتصفح.");
    }
    if (String(data.user.tenantId) !== String(state.storeTenantId)) {
      throw new Error("هذا الحساب مرتبط بمتجر آخر.");
    }
    state.customerToken = data.token;
    localStorage.setItem("easyShopeCustomerToken", state.customerToken);
    showMessage(`مرحبًا ${data.user.name || ""}`);
    form.reset();
    await loadCustomerOrders();
  } catch (error) {
    showMessage(error.message || String(error), true);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "دخول";
    }
  }
}

async function loadCustomerOrders() {
  if (!state.customerToken) return showMessage("أنشئ حساب عميل أولًا لعرض الطلبات.", true);
  try {
    const data = await customerApi("/api/customer/orders");
    $("customer-orders").innerHTML =
      data.orders
        .map(
          (order) =>
            `<li><strong>${money(order.total_cents)}</strong><span>${orderStatusLabel(order.status)} — ${order.payment_status}</span>${order.tracking_url ? `<br><a href="${order.tracking_url}">متابعة الطلب</a>` : order.trackingUrl ? `<br><a href="${order.trackingUrl}">متابعة الطلب</a>` : ""}${order.carrierTrackingUrl ? `<br><a href="${order.carrierTrackingUrl}" target="_blank" rel="noopener">تتبع الشحنة</a>` : ""}</li>`,
        )
        .join("") || "<li>لا توجد طلبات لهذا العميل بعد.</li>";
  } catch (error) {
    showMessage(error.message, true);
  }
}

function initStorefrontDelegation() {
  const shell = $("storefront-shell");
  if (!shell || shell.dataset.delegationBound === "1") return;
  shell.dataset.delegationBound = "1";
  shell.addEventListener("click", async (e) => {
    const navBtn = e.target.closest("#storefront-bottom-nav [data-store-nav]");
    if (navBtn) {
      e.preventDefault();
      const id = navBtn.dataset.storeNav;
      if (id === "cart") {
        if (isStoreClientMode()) setStoreCartOpen(true);
        else $("storefront-cart-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (id === "cats") $("storefront-categories")?.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (id === "account") setStoreAccountOpen(true);
      else $("storefront-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelectorAll("#storefront-bottom-nav [data-store-nav]").forEach((b) => b.classList.toggle("is-active", b === navBtn));
      return;
    }
    const categoryBtn = e.target.closest(
      "#store-category-slider [data-store-category], #storefront-categories [data-store-category], #storefront-stories [data-store-category], #storefront-chrome-tabs [data-store-category], #storefront-category-rail [data-store-category]",
    );
    if (categoryBtn) {
      e.preventDefault();
      state.storefrontCategory = categoryBtn.dataset.storeCategory ?? "";
      await loadStorefront();
      return;
    }
    const dot = e.target.closest(".storefront-spotlight-dot[data-slide-to]");
    if (dot) {
      e.preventDefault();
      const idx = Number(dot.dataset.slideTo);
      const spotlight = $("storefront-spotlight");
      if (!spotlight || Number.isNaN(idx)) return;
      spotlight.querySelectorAll(".storefront-spotlight-slide").forEach((el, i) => el.classList.toggle("is-active", i === idx));
      spotlight.querySelectorAll(".storefront-spotlight-dot").forEach((el, i) => el.classList.toggle("is-active", i === idx));
      return;
    }
    const addBtn = e.target.closest("[data-add-cart]");
    if (addBtn) {
      addToCart(addBtn.dataset.addCart, addBtn.dataset.title, Number(addBtn.dataset.price));
      return;
    }
    const viewBtn = e.target.closest("[data-view-product]");
    if (!viewBtn) return;
    const slug = $("tenant-slug").value.trim();
    const data = await api(`/api/store/${slug}/products/${viewBtn.dataset.viewProduct}`);
    const variants = Array.isArray(data.product.variants) ? data.product.variants : [];
    let reviewsHtml = "";
    if (state.checkoutConfig?.reviewsEnabled !== false) {
      try {
        const reviewsData = await api(`/api/store/${slug}/products/${data.product.slug}/reviews`);
        const reviewItems = (reviewsData.reviews || [])
          .slice(0, 5)
          .map((r) => `<li><strong>${"★".repeat(r.rating)}</strong> ${escapeHtmlText(r.customer_name)}<br><small>${escapeHtmlText(r.comment || "")}</small></li>`)
          .join("");
        reviewsHtml = `<div class="product-reviews"><strong>التقييمات${reviewsData.averageRating ? ` (${reviewsData.averageRating}/5)` : ""}</strong><ul class="list">${reviewItems || "<li>لا توجد تقييمات بعد.</li>"}</ul>
          <form class="form-stack product-review-form" data-review-product="${data.product.slug}">
            <label>اسمك<input name="customerName" required></label>
            <label>التقييم<select name="rating"><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option></select></label>
            <label>تعليق<textarea name="comment"></textarea></label>
            <button type="submit">إرسال تقييم</button>
          </form></div>`;
      } catch {
        reviewsHtml = "";
      }
    }
    $("product-detail").innerHTML = `${productMediaHtml(data.product)}<strong>${data.product.title_ar}</strong><p>${data.product.description || "لا يوجد وصف."}</p><div class="price-stack">${productPriceHtml(data.product)}</div><p>${data.product.stock_quantity} في المخزون</p>${
      variants.length
        ? `<div class="variant-pills">${variants
            .map((variant) => `<span>${variant.type || "نوع"} ${variant.color || ""}${variant.extraPriceCents ? ` + ${money(variant.extraPriceCents)}` : ""}${variant.stockQuantity !== null && variant.stockQuantity !== undefined ? ` - مخزون ${variant.stockQuantity}` : ""}</span>`)
            .join("")}</div>`
        : ""
    }${reviewsHtml}`;
    $("product-detail")?.querySelector(".product-review-form")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const fd = new FormData(form);
      try {
        const res = await api(`/api/store/${slug}/products/${form.dataset.reviewProduct}/reviews`, {
          method: "POST",
          body: JSON.stringify({
            customerName: fd.get("customerName"),
            rating: Number(fd.get("rating")),
            comment: fd.get("comment") || undefined,
          }),
        });
        showMessage(res.message || "تم إرسال التقييم.");
        form.reset();
      } catch (err) {
        showMessage(err.message, true);
      }
    });
    if (isStoreClientMode()) {
      document.body.classList.add("store-product-detail-open");
      setStoreCartOpen(true);
    }
  });
}

function addToCart(productId, title, priceCents) {
  const existing = state.cart.find((item) => item.productId === productId);
  if (existing) existing.quantity += 1;
  else state.cart.push({ productId, title, priceCents, quantity: 1 });
  renderCart();
  if (isStoreClientMode()) {
    setStoreCartOpen(true);
    showMessage(`تمت إضافة «${title}» إلى السلة.`);
  }
}

function renderCart() {
  const totalQty = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = state.cart.reduce((total, item) => total + item.priceCents * item.quantity, 0);
  $("cart-items").innerHTML =
    state.cart
      .map(
        (item) => `<li><strong>${item.title} x ${item.quantity}</strong><span>${money(item.priceCents * item.quantity)} <button class="mini-button" data-remove-cart="${item.productId}">حذف</button></span></li>`,
      )
      .join("") || "<li>السلة فارغة.</li>";
  if ($("checkout-subtotal")) $("checkout-subtotal").textContent = money(subtotalCents);
  if ($("cart-total")) $("cart-total").textContent = money(subtotalCents);
  void updateCheckoutQuote();
  const fabCount = $("store-cart-fab-count");
  const toolbarCount = $("store-cart-toolbar-count");
  if (fabCount) {
    fabCount.textContent = String(totalQty);
    fabCount.classList.toggle("is-visible", totalQty > 0);
  }
  if (toolbarCount) {
    toolbarCount.textContent = String(totalQty);
    toolbarCount.classList.toggle("is-visible", totalQty > 0);
  }
  const cartFab = $("store-cart-fab");
  if (cartFab) cartFab.classList.toggle("has-items", totalQty > 0);
  document.querySelectorAll("[data-remove-cart]").forEach((button) => {
    button.addEventListener("click", () => {
      state.cart = state.cart.filter((item) => item.productId !== button.dataset.removeCart);
      renderCart();
    });
  });
}

async function loadBillingData() {
  if (!state.token || ["platform_owner", "platform_admin"].includes(state.role)) return;
  const [store, invoices] = await Promise.all([api("/api/merchant/store"), api("/api/merchant/subscription-invoices")]);
  renderBilling(store.store, invoices.invoices);
}

async function loadAccountingData() {
  if (!state.token || ["platform_owner", "platform_admin"].includes(state.role)) return;
  if (!state.merchantPlans?.length) await loadPlans().catch(() => undefined);
  const data = await api("/api/merchant/accounting");
  renderAccountingModule(data);
}

function renderAccountingPlanCards(plans) {
  const grid = $("accounting-plans-grid");
  if (!grid) return;
  const activePlans = (plans || []).filter((p) => p.is_active !== false);
  if (!activePlans.length) {
    grid.innerHTML = `<div class="empty-state"><strong>لا توجد خطط</strong></div>`;
    return;
  }
  grid.innerHTML = activePlans
    .map(
      (plan) => `<div class="plan-picker-card plan-picker-card--readonly" role="listitem">
        <strong>${escapeHtmlText(plan.name)}</strong>
        <div class="plan-price">${money(plan.price_cents)}</div>
        <small>${plan.duration_months || 1} شهر</small>
      </div>`,
    )
    .join("");
}

function renderAccountingModule(data) {
  const link = data.link;
  const form = $("accounting-link-form");
  const statusEl = $("accounting-status");
  const logEl = $("accounting-sync-log");
  const cashLink = $("accounting-cash-link");
  const discoverBox = $("accounting-discover-box");

  if (state.merchantPlans?.length) renderAccountingPlanCards(state.merchantPlans);
  else if (data.plans?.length) renderAccountingPlanCards(data.plans);

  if (discoverBox) {
    if (data.merchantOwnerEmail && !link?.cash_tenant_slug) {
      discoverBox.hidden = false;
      discoverBox.innerHTML = `<strong>ربط تلقائي</strong><p>لو حساب Easy Cash مسجّل بنفس إيميل صاحب المتجر (<strong>${escapeHtmlText(data.merchantOwnerEmail)}</strong>)، اضغط «ربط تلقائي» وسيتعرّف النظام على شركتك بدون إدخال المعرف يدوياً.</p>`;
    } else {
      discoverBox.hidden = true;
      discoverBox.innerHTML = "";
    }
  }

  if (cashLink && link?.cash_tenant_slug) {
    const base = (link.cash_base_url || "https://cash.easytecheg.net").replace(/\/$/, "");
    cashLink.href = `${base}/${link.cash_tenant_slug}/`;
  }

  if (form) {
    form.enabled.checked = Boolean(link?.enabled);
    form.cashTenantSlug.value = link?.cash_tenant_slug || "";
    form.cashBaseUrl.value = link?.cash_base_url || "https://cash.easytecheg.net";
    form.syncProductsToCash.checked = link?.sync_products_to_cash !== false;
    form.syncProductsFromCash.checked = link?.sync_products_from_cash !== false;
    form.syncOrdersToCash.checked = link?.sync_orders_to_cash !== false;
  }

  if (statusEl) {
    const enabled = Boolean(link?.enabled);
    statusEl.className = `subscription-status-card ${enabled ? "is-active" : link?.cash_tenant_slug ? "is-trial" : ""}`.trim();
    const lastSync = link?.last_sync_at ? new Date(link.last_sync_at).toLocaleString("ar-EG") : "—";
    const err = link?.last_sync_error ? `<p class="text-danger">${escapeHtmlText(link.last_sync_error)}</p>` : "";
    statusEl.innerHTML = enabled
      ? `<strong>الربط مفعّل</strong><p>شركة المحاسبة: <strong>${escapeHtmlText(link.cash_tenant_slug || "—")}</strong> · آخر مزامنة: ${lastSync}</p>${err}`
      : link?.cash_tenant_slug
        ? `<strong>الربط جاهز — غير مفعّل</strong><p>فعّل المربع أعلاه لبدء المزامنة التلقائية.</p>`
        : `<strong>لم يُضبط الربط بعد</strong><p>أدخل معرف شركتك في Easy Cash (مثل philo) ثم احفظ.</p>`;
    if (!data.integrationConfigured) {
      statusEl.innerHTML += `<p class="text-warn"><small>تنبيه للمسؤول: SHOPE_INTEGRATION_SECRET غير مضبوط على خادم Easy Shope.</small></p>`;
    }
  }

  if (logEl) {
    const rows = data.syncLog || [];
    logEl.innerHTML =
      rows
        .map(
          (row) =>
            `<li><div class="provider-line"><strong>${escapeHtmlText(row.entity_type || "")}</strong>${statusBadge(row.status === "ok" ? "paid" : "failed")}</div><small>${escapeHtmlText(row.direction || "")} · ${row.created_at ? new Date(row.created_at).toLocaleString("ar-EG") : ""}</small><p>${escapeHtmlText(row.message || "")}</p></li>`,
        )
        .join("") || "<li>لا يوجد سجل مزامنة بعد — بعد تفعيل الربط ستظهر العمليات هنا.</li>";
  }
}

async function saveAccountingLink(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const body = {
      enabled: form.enabled.checked,
      cashTenantSlug: form.cashTenantSlug.value.trim(),
      cashBaseUrl: form.cashBaseUrl.value.trim(),
      syncProductsToCash: form.syncProductsToCash.checked,
      syncProductsFromCash: form.syncProductsFromCash.checked,
      syncOrdersToCash: form.syncOrdersToCash.checked,
    };
    await api("/api/merchant/accounting", { method: "PUT", body: JSON.stringify(body) });
    showMessage("تم حفظ إعدادات الربط مع Easy Cash");
    await loadAccountingData();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function autoLinkAccounting() {
  const form = $("accounting-link-form");
  try {
    $("accounting-status").innerHTML = "<strong>جارٍ البحث عن شركة Easy Cash بإيميل حسابك…</strong>";
    const body = { cashBaseUrl: form?.cashBaseUrl?.value?.trim() || undefined, enable: form?.enabled?.checked !== false };
    const data = await api("/api/merchant/accounting/auto-link", { method: "POST", body: JSON.stringify(body) });
    showMessage(data.matchedByEmail ? `تم الربط تلقائياً — ${data.link?.cash_tenant_slug}` : "تم حفظ الربط");
    await loadAccountingData();
    if (data.link?.cash_tenant_slug) await testAccountingLink();
  } catch (error) {
    if (error.statusCode === 409 && error.payload?.matches?.length) {
      const picks = error.payload.matches
        .map((m) => `<button type="button" class="mini-button" data-pick-cash-slug="${escapeHtmlText(m.slug)}">${escapeHtmlText(m.name)} (${escapeHtmlText(m.slug)})</button>`)
        .join(" ");
      $("accounting-discover-box").hidden = false;
      $("accounting-discover-box").innerHTML = `<strong>اختر الشركة</strong><p>وُجد أكثر من شركة بنفس الإيميل:</p><div class="inline-actions">${picks}</div>`;
      $("accounting-discover-box").querySelectorAll("[data-pick-cash-slug]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            const body = {
              cashTenantSlug: btn.dataset.pickCashSlug,
              cashBaseUrl: form?.cashBaseUrl?.value?.trim() || undefined,
              enable: true,
            };
            await api("/api/merchant/accounting/auto-link", { method: "POST", body: JSON.stringify(body) });
            showMessage(`تم الربط — ${btn.dataset.pickCashSlug}`);
            await loadAccountingData();
          } catch (pickErr) {
            showMessage(pickErr.message, true);
          }
        });
      });
    }
    showMessage(error.message, true);
    await loadAccountingData();
  }
}

async function testAccountingLink() {
  try {
    $("accounting-status").innerHTML = "<strong>جارٍ اختبار الاتصال…</strong>";
    const data = await api("/api/merchant/accounting/test", { method: "POST", body: JSON.stringify({}) });
    showMessage(`الاتصال ناجح — معرف الشركة: ${data.tenantSlug || "OK"}`);
    await loadAccountingData();
  } catch (error) {
    showMessage(error.message, true);
    await loadAccountingData();
  }
}

function renderBilling(store, invoices) {
  const activeText = store.status === "active" ? "الخدمة مفعلة" : store.status === "trial" ? "فترة تجربة مجانية" : store.status;
  const expiry = store.subscription_expires_at ? new Date(store.subscription_expires_at) : null;
  const daysLeft = expiry ? Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const expiryText = expiry ? expiry.toLocaleDateString("ar-EG") : "غير محدد";
  const statusCardClass =
    store.status === "active" ? "is-active" : store.status === "trial" ? "is-trial" : daysLeft !== null && daysLeft < 0 ? "is-danger" : "";
  const expiryBadge =
    daysLeft === null
      ? ""
      : daysLeft < 0
        ? `<span class="status-badge off">منتهي</span>`
        : daysLeft <= 7
          ? `<span class="status-badge warn">ينتهي خلال ${daysLeft} يوم</span>`
          : `<span class="status-badge ok">متبقي ${daysLeft} يوم</span>`;
  const statusEl = $("subscription-status");
  if (statusEl) {
    statusEl.className = `subscription-status-card ${statusCardClass}`.trim();
    statusEl.innerHTML = `<div class="provider-line"><strong>${activeText}</strong>${expiryBadge}</div><p>الخطة الحالية: <strong>${store.plan_code || "—"}</strong> · ينتهي: ${expiryText}</p>`;
  }
  if (state.merchantPlans?.length) renderSubscriptionPlanCards(state.merchantPlans, store.plan_code);
  const paid = (invoices || []).filter((invoice) => invoice.status === "paid");
  const open = (invoices || []).filter((invoice) => invoice.status !== "paid");

  $("subscription-invoices-paid").innerHTML =
    paid
      .map(
        (invoice) =>
          `<li><div class="provider-line"><strong>${invoice.plan_name || invoice.plan_code}</strong>${statusBadge("paid")}</div><small>${money(invoice.amount_cents)} · ${invoice.provider || ""} ${invoice.provider_reference || ""}</small></li>`,
      )
      .join("") || "<li>لا توجد فواتير مدفوعة بعد.</li>";

  $("subscription-invoices-open").innerHTML =
    open
      .map(
        (invoice) => `<li><div class="provider-line"><strong>${invoice.plan_name || invoice.plan_code}</strong>${statusBadge(invoice.status)}</div><small>${money(invoice.amount_cents)}</small><button type="button" class="mini-button invoice-pay-btn" data-pay-invoice="${invoice.id}">دفع Paymob</button></li>`,
      )
      .join("") || "<li>لا توجد فواتير غير مدفوعة.</li>";
  document.querySelectorAll("[data-pay-invoice]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        button.disabled = true;
        button.textContent = "جارٍ تجهيز الدفع...";
        const data = await api(`/api/merchant/subscription-invoices/${button.dataset.payInvoice}/pay`, { method: "POST", body: JSON.stringify({}) });
        showMessage(`تم تجهيز دفع Paymob: ${data.payment.status}`);
        $("subscription-status").innerHTML = `<strong>تم تجهيز الدفع</strong><p>لو لم تفتح صفحة Paymob تلقائيًا، اضغط زر الدفع مرة أخرى.</p>`;
        if (data.payment.checkoutUrl) window.open(data.payment.checkoutUrl, "_blank", "noopener");
        await loadBillingData();
      } catch (error) {
        showMessage(error.message, true);
        $("subscription-status").innerHTML = `<strong>تعذر تجهيز الدفع</strong><p>${error.message}</p>`;
      } finally {
        button.disabled = false;
        button.textContent = "دفع Paymob";
      }
    });
  });
}

async function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("subscription_invoice")) {
    setView("catalog");
    setMerchantTab("billing");
    showMessage("رجعت من Paymob. نتحقق من نتيجة الدفع الآن...");
    try {
      const payload = Object.fromEntries(params.entries());
      const result = await api("/api/payments/paymob/return", { method: "POST", body: JSON.stringify(payload) });
      if (result.status === "paid") {
        showMessage("تم تأكيد الدفع وتفعيل الاشتراك تلقائيًا.");
      } else if (result.status === "waiting_webhook") {
        showMessage("وصل رجوع Paymob. سنحدث الاشتراك تلقائيًا بعد وصول webhook.");
      } else {
        showMessage(`حالة دفع Paymob: ${result.status}`);
      }
    } catch (error) {
      showMessage(error.message, true);
    }
    if (state.token && !["platform_owner", "platform_admin"].includes(state.role)) {
      await loadBillingData();
      await refreshMe();
    }
  }
  if (params.has("order")) {
    setView("storefront");
    $("checkout-result").innerHTML = "<strong>رجعت من Paymob</strong><p>لو الدفع تم بنجاح ستتحدث حالة الطلب تلقائيًا بعد وصول webhook.</p>";
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
}

function adminStatusBadge(status) {
  const cls = status === "active" || status === "paid" || status === "succeeded" ? "ok" : status === "trial" || status === "pending" || status === "running" ? "warn" : "off";
  return `<span class="status-badge ${cls}">${status}</span>`;
}

function renderAdminOverview(overview, tenants) {
  $("admin-tenants-total").textContent = sumRows(overview.tenants);
  $("admin-tenants-active").textContent = `${statusCount(overview.tenants, "active")} نشط`;
  if ($("admin-tenants-trial")) $("admin-tenants-trial").textContent = statusCount(overview.tenants, "trial");
  if ($("admin-tenants-expired")) $("admin-tenants-expired").textContent = `${statusCount(overview.tenants, "expired")} منتهي`;
  $("admin-orders-total").textContent = overview.orders.count;
  if ($("admin-customers-total")) $("admin-customers-total").textContent = `${overview.customers?.count ?? 0} عميل`;
  $("admin-revenue-total").textContent = money(overview.orders.total_cents);
  if ($("admin-products-total")) $("admin-products-total").textContent = `${overview.products?.count ?? 0} منتج`;
  $("admin-invoices-total").textContent = sumRows(overview.subscriptionInvoices);
  $("admin-invoices-paid").textContent = `${statusCount(overview.subscriptionInvoices, "paid")} مدفوعة`;
  const paidRow = (overview.subscriptionInvoices || []).find((r) => r.status === "paid");
  if ($("admin-subscription-revenue")) $("admin-subscription-revenue").textContent = money(paidRow?.total_cents || 0);

  const activeCount = statusCount(overview.tenants, "active");
  const trialCount = statusCount(overview.tenants, "trial");
  const suspended = statusCount(overview.tenants, "suspended");
  const expired = statusCount(overview.tenants, "expired");
  const pendingInvoices = statusCount(overview.subscriptionInvoices, "pending");

  renderTenantDistribution({ active: activeCount, trial: trialCount, suspended, expired });

  const alerts = [];
  if (suspended) alerts.push({ level: "danger", text: `${suspended} متجر موقوف — راجع تبويب التجار.` });
  if (expired) alerts.push({ level: "danger", text: `${expired} متجر منتهي الاشتراك.` });
  if (pendingInvoices) alerts.push({ level: "warn", text: `${pendingInvoices} فاتورة اشتراك معلّقة بانتظار الدفع.` });
  if (trialCount) alerts.push({ level: "warn", text: `${trialCount} متجر في فترة التجربة المجانية.` });
  if (!alerts.length) alerts.push({ level: "ok", text: "كل شيء على ما يرام — لا توجد تنبيهات حرجة حاليًا." });
  if ($("admin-overview-alerts")) {
    $("admin-overview-alerts").innerHTML = alerts
      .map((a) => `<li class="insight insight--${a.level}"><span class="insight-dot"></span><span>${a.text}</span></li>`)
      .join("");
  }

  const expiring =
    (tenants || [])
      .map((t) => ({ tenant: t, days: trialDaysRemaining(t.subscription_expires_at) }))
      .filter(({ tenant, days }) => tenant.status === "trial" && days !== null && days > 0 && days <= 7)
      .sort((a, b) => a.days - b.days) || [];
  if ($("admin-expiring-trials")) {
    $("admin-expiring-trials").innerHTML =
      expiring
        .map(
          ({ tenant, days }) => `<li class="expiring-card${days <= 2 ? " is-urgent" : ""}">
            <strong>${tenant.name_ar || tenant.name_en}</strong>
            <small class="muted">@${tenant.slug}</small>
            <span class="days-left">متبقي ${days} يوم</span>
          </li>`,
        )
        .join("") || `<li class="expiring-card" style="border-inline-start-color:#34d399"><strong>لا يوجد تجار على وشك الانتهاء</strong><small class="muted">خلال 7 أيام القادمة</small></li>`;
  }
}

const TENANT_STATUS_META = {
  active: { label: "نشط", color: "#34d399" },
  trial: { label: "تجربة", color: "#fbbf24" },
  suspended: { label: "موقوف", color: "#fb7185" },
  expired: { label: "منتهي", color: "#64748b" },
};

function renderTenantDistribution(counts) {
  const bar = $("admin-tenant-distribution");
  const legend = $("admin-tenant-distribution-legend");
  if (!bar || !legend) return;
  const total = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);
  if (!total) {
    bar.innerHTML = "";
    legend.innerHTML = `<span class="seg-item">لا يوجد تجار بعد.</span>`;
    return;
  }
  bar.innerHTML = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => {
      const meta = TENANT_STATUS_META[key];
      const pct = ((n / total) * 100).toFixed(1);
      return `<span style="width:${pct}%;background:${meta.color}" title="${meta.label}: ${n}"></span>`;
    })
    .join("");
  legend.innerHTML = Object.entries(counts)
    .map(([key, n]) => {
      const meta = TENANT_STATUS_META[key];
      const pct = total ? Math.round((n / total) * 100) : 0;
      return `<span class="seg-item"><span class="seg-dot" style="background:${meta.color}"></span>${meta.label} <b>${n}</b> <small class="muted">(${pct}%)</small></span>`;
    })
    .join("");
}

function renderAdminTenantsTable() {
  const tbody = $("admin-tenants-table");
  if (!tbody) return;
  const q = ($("admin-tenant-search")?.value || "").trim().toLowerCase();
  const statusFilter = $("admin-tenant-status-filter")?.value || "";
  const rows = state.adminTenants.filter((tenant) => {
    if (statusFilter && tenant.status !== statusFilter) return false;
    if (!q) return true;
    const hay = `${tenant.name_ar} ${tenant.name_en} ${tenant.slug} ${tenant.owner_email || ""} ${tenant.owner_name || ""}`.toLowerCase();
    return hay.includes(q);
  });
  tbody.innerHTML =
    rows
      .map((tenant) => {
        const daysLeft = trialDaysRemaining(tenant.subscription_expires_at);
        const expiryCell = tenant.subscription_expires_at
          ? `<small>${formatTrialExpiryDate(tenant.subscription_expires_at)}</small><br><strong>${daysLeft === null ? "—" : daysLeft <= 0 ? "منتهي" : `${daysLeft} يوم`}</strong>`
          : "—";
        return `<tr>
          <td><strong>${tenant.name_ar || tenant.name_en}</strong><br><small>${tenant.slug}</small><br><small class="muted">${tenant.storefront_theme || "ocean"}</small></td>
          <td>${tenant.owner_name || "—"}<br><small>${tenant.owner_email || ""}</small></td>
          <td>${adminStatusBadge(tenant.status)}</td>
          <td>${tenant.plan_code}</td>
          <td>${expiryCell}</td>
          <td>${tenant.products_count} منتج / ${tenant.orders_count} طلب<br>${money(tenant.revenue_cents)}</td>
          <td><div class="row-actions admin-row-actions">
            <button type="button" data-admin-tenant-detail="${tenant.id}">تفاصيل</button>
            <button type="button" class="success-button" data-tenant-status="${tenant.id}:active">تفعيل</button>
            <button type="button" class="danger-button" data-tenant-status="${tenant.id}:suspended">تعليق</button>
            <button type="button" data-tenant-extend="${tenant.id}">+ شهر</button>
            <button type="button" data-tenant-extend-trial="${tenant.id}:7">+7 يوم</button>
            <button type="button" data-tenant-extend-trial="${tenant.id}:30">+30 يوم</button>
          </div></td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="7">لا توجد متاجر مطابقة.</td></tr>`;
}

function renderAdminPlans(plans) {
  $("admin-plans").innerHTML = plans
    .map(
      (plan) => `<div class="plan-card plan-card--admin">
        <div class="plan-card-top">
          <div><strong>${escapeHtmlText(plan.name)}</strong><br><small>${plan.duration_months} شهر · ${plan.is_active ? "مفعّلة" : "معطّلة"}</small></div>
          <div class="plan-card-price">${money(plan.price_cents)}</div>
        </div>
        <div class="row-actions">
          <input type="text" value="${escapeHtmlText(plan.name)}" data-plan-name="${plan.code}" placeholder="اسم الخطة">
          <input type="number" value="${(plan.price_cents / 100).toFixed(2)}" data-plan-price="${plan.code}">
          <label class="check"><input type="checkbox" data-plan-active="${plan.code}" ${plan.is_active ? "checked" : ""}> نشطة</label>
          <button type="button" data-plan-save="${plan.code}">حفظ</button>
        </div>
      </div>`,
    )
    .join("");
}

function renderAdminInvoices(invoices) {
  $("admin-invoices-table").innerHTML =
    invoices
      .map(
        (invoice) => `<tr>
          <td><strong>${invoice.tenant_name}</strong><br><small>${invoice.tenant_slug}</small></td>
          <td>${invoice.plan_code}</td>
          <td>${money(invoice.amount_cents)}</td>
          <td>${adminStatusBadge(invoice.status)}<br><small>${invoice.provider || ""}</small></td>
          <td><small>${formatDateTime(invoice.created_at)}</small></td>
          <td><div class="row-actions">
            <button type="button" class="success-button" data-invoice-status="${invoice.id}:paid">مدفوعة</button>
            <button type="button" data-invoice-status="${invoice.id}:expired">منتهية</button>
            <button type="button" class="danger-button" data-invoice-status="${invoice.id}:failed">فشل</button>
          </div></td>
        </tr>`,
      )
      .join("") || `<tr><td colspan="6">لا توجد فواتير بعد.</td></tr>`;
}

function fillAdminInvoiceForm() {
  const tenantSelect = $("admin-invoice-tenant");
  const planSelect = $("admin-invoice-plan");
  if (tenantSelect) {
    tenantSelect.innerHTML = state.adminTenants.map((t) => `<option value="${t.id}">${t.name_ar || t.name_en} (${t.slug})</option>`).join("");
  }
  if (planSelect) {
    planSelect.innerHTML = state.adminPlans
      .filter((p) => p.is_active)
      .map((p) => `<option value="${p.code}">${p.name} — ${money(p.price_cents)}</option>`)
      .join("");
  }
}

async function loadAdminOrders() {
  const tbody = $("admin-orders-table");
  if (!tbody) return;
  try {
    const status = $("admin-order-status-filter")?.value || "";
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await api(`/api/admin/orders${qs}`);
    tbody.innerHTML =
      data.orders
        .map(
          (order) => `<tr>
            <td><strong>${order.tenant_name}</strong><br><small>${order.tenant_slug}</small></td>
            <td>${order.customer_name}<br><small>${order.customer_phone}</small></td>
            <td>${money(order.total_cents)}</td>
            <td>${adminStatusBadge(order.status)}</td>
            <td>${adminStatusBadge(order.payment_status)}</td>
            <td><small>${formatDateTime(order.created_at)}</small></td>
          </tr>`,
        )
        .join("") || `<tr><td colspan="6">لا توجد طلبات.</td></tr>`;
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
  }
}

async function loadAdminAndroidBuilds() {
  const tbody = $("admin-android-builds-table");
  if (!tbody) return;
  try {
    const data = await api("/api/admin/android-builds");
    tbody.innerHTML =
      data.builds
        .map(
          (build) => `<tr>
            <td><strong>${build.tenant_name}</strong><br><small>${build.tenant_slug}</small></td>
            <td>${adminStatusBadge(build.status)}</td>
            <td>${build.artifact_url ? `<a href="${build.artifact_url}" target="_blank" rel="noopener">APK</a>` : build.github_run_url ? `<a href="${build.github_run_url}" target="_blank" rel="noopener">Run</a>` : "—"}</td>
            <td><small>${formatDateTime(build.created_at)}</small></td>
            <td><small>${build.error_message || "—"}</small></td>
          </tr>`,
        )
        .join("") || `<tr><td colspan="5">لا توجد عمليات بناء.</td></tr>`;
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
  }
}

async function openAdminTenantDetail(tenantId) {
  const dlg = $("admin-tenant-dialog");
  const body = $("admin-tenant-dialog-body");
  const title = $("admin-tenant-dialog-title");
  if (!dlg || !body) return;
  body.innerHTML = "جاري التحميل...";
  dlg.showModal();
  try {
    const data = await api(`/api/admin/tenants/${tenantId}`);
    const t = data.tenant;
    if (title) title.textContent = t.name_ar || t.name_en || t.slug;
    const storeUrl = `${window.location.origin}/store/${t.slug}`;
    body.innerHTML = `<div class="dialog-grid">
      <div><strong>المعرف</strong><p>${t.slug}</p></div>
      <div><strong>رقم تسلسلي</strong><p>${t.serial_code || "—"}</p></div>
      <div><strong>الحالة</strong><p>${adminStatusBadge(t.status)} ${t.plan_code}</p></div>
      <div><strong>المالك</strong><p>${t.owner_name || "—"}<br>${t.owner_email || ""}<br>${t.owner_phone || ""}</p></div>
      <div><strong>انتهاء الاشتراك</strong><p>${formatTrialExpiryDate(t.subscription_expires_at)}</p></div>
      <div><strong>القالب</strong><p>${t.storefront_theme || "ocean"}</p></div>
      <div><strong>الدفع</strong><p>${t.payment_enabled ? "مربوط" : "غير مفعّل"}</p></div>
      <div><strong>الأداء</strong><p>${t.products_count} منتج — ${t.orders_count} طلب — ${money(t.revenue_cents)}</p></div>
      <div><strong>APK</strong><p>${t.android_builds_succeeded || 0} ناجح / ${t.android_builds_count || 0} إجمالي</p></div>
      <div class="span-2"><strong>رابط المتجر</strong><p><a href="${storeUrl}" target="_blank" rel="noopener">${storeUrl}</a></p></div>
      <div class="span-2"><strong>آخر بناء APK</strong><ul class="list">${(data.androidBuilds || [])
        .slice(0, 5)
        .map((b) => `<li>${adminStatusBadge(b.status)} — ${formatDateTime(b.created_at)} ${b.artifact_url ? `<a href="${b.artifact_url}" target="_blank">تحميل</a>` : ""}</li>`)
        .join("") || "<li>لا يوجد</li>"}</ul></div>
    </div>`;
  } catch (error) {
    body.innerHTML = `<p>${error.message}</p>`;
  }
}

async function createAdminInvoice(event) {
  event.preventDefault();
  const tenantId = $("admin-invoice-tenant")?.value;
  const planCode = $("admin-invoice-plan")?.value;
  if (!tenantId || !planCode) return;
  await api("/api/admin/subscription-invoices", { method: "POST", body: JSON.stringify({ tenantId, planCode }) });
  showMessage("تم إنشاء فاتورة للتاجر.");
  await loadAdmin();
}

async function loadAdmin() {
  if (!state.token) return;
  try {
    const [overview, tenants, plans, invoices, platformProviders, platformSettings] = await Promise.all([
      api("/api/admin/overview"),
      api("/api/admin/tenants"),
      api("/api/admin/plans"),
      api("/api/admin/subscription-invoices"),
      api("/api/admin/payment-providers"),
      api("/api/admin/platform-settings"),
    ]);
    state.adminTenants = tenants.tenants || [];
    state.adminPlans = plans.plans || [];
    renderAdminOverview(overview, state.adminTenants);
    if ($("platform-trial-days")) $("platform-trial-days").value = platformSettings.trialDaysDefault ?? 30;
    if ($("platform-trial-settings-status")) {
      $("platform-trial-settings-status").innerHTML = `<strong>الإعداد الحالي</strong><p>كل تاجر جديد: <strong>${platformSettings.trialDaysDefault ?? 30} يوم</strong> تجربة.</p>`;
    }
    renderAdminTenantsTable();
    renderAdminPlans(state.adminPlans);
    renderAdminInvoices(invoices.invoices || []);
    fillAdminInvoiceForm();
    renderPlatformProviders(platformProviders.providers);
    bindAdminActions();
  } catch {
    $("admin-tenants-table").innerHTML = `<tr><td colspan="7">سجل دخول كسوبر أدمن لعرض هذا القسم.</td></tr>`;
  }
}

function renderPlatformProviders(providers) {
  const paymob = providers.find((provider) => provider.provider === "paymob");
  renderPaymobStatusPanel("platform-paymob-status", paymob, { scope: "platform" });
  fillPaymobCallbackUrls();
}

function bindAdminActions() {
  document.querySelectorAll("[data-tenant-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [tenantId, status] = button.dataset.tenantStatus.split(":");
      await api(`/api/admin/tenants/${tenantId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      showMessage(`تم تحديث حالة المتجر إلى ${status}.`);
      await loadAdmin();
    });
  });
  document.querySelectorAll("[data-tenant-extend]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/tenants/${button.dataset.tenantExtend}/extend`, { method: "POST", body: JSON.stringify({ months: 1 }) });
      showMessage("تم تمديد الاشتراك شهرًا.");
      await loadAdmin();
    });
  });
  document.querySelectorAll("[data-tenant-extend-trial]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [tenantId, days] = button.dataset.tenantExtendTrial.split(":");
      await api(`/api/admin/tenants/${tenantId}/extend-trial`, { method: "POST", body: JSON.stringify({ days: Number(days) }) });
      showMessage(`تم تمديد التجربة ${days} يومًا.`);
      await loadAdmin();
    });
  });
  document.querySelectorAll("[data-plan-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = button.dataset.planSave;
      const priceInput = document.querySelector(`[data-plan-price="${code}"]`);
      const nameInput = document.querySelector(`[data-plan-name="${code}"]`);
      const activeInput = document.querySelector(`[data-plan-active="${code}"]`);
      await api(`/api/admin/plans/${code}`, {
        method: "PATCH",
        body: JSON.stringify({
          priceCents: Math.round(Number(priceInput.value) * 100),
          name: nameInput?.value?.trim() || undefined,
          isActive: activeInput?.checked,
        }),
      });
      showMessage("تم تحديث الخطة.");
      await loadAdmin();
    });
  });
  document.querySelectorAll("[data-admin-tenant-detail]").forEach((button) => {
    button.addEventListener("click", () => openAdminTenantDetail(button.dataset.adminTenantDetail));
  });
  document.querySelectorAll("[data-invoice-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [invoiceId, status] = button.dataset.invoiceStatus.split(":");
      await api(`/api/admin/subscription-invoices/${invoiceId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      showMessage(`تم تحديث الفاتورة إلى ${status}.`);
      await loadAdmin();
    });
  });
}

async function bootstrap() {
  try {
    if (isStoreClientMode()) applyStoreClientShell();
    updateNavigation();
    const health = await api("/api/health");
    $("api-status").textContent = health.ok ? "API online" : "API error";
    if ($("overview-api")) {
      $("overview-api").textContent = health.ok ? "online" : "error";
      $("overview-api").className = health.ok ? "ok" : "";
    }
    if ($("overview-db")) {
      $("overview-db").textContent = health.db === false ? "checking" : "online";
      $("overview-db").className = "ok";
    }
    $("api-dot").classList.toggle("ok", Boolean(health.ok));
    await refreshMe();
    if (isStoreClientMode()) {
      const slug = getStoreSlugFromUrl() || state.tenantSlug || $("tenant-slug")?.value?.trim();
      if (slug) {
        if ($("tenant-slug")) $("tenant-slug").value = slug;
        state.tenantSlug = slug;
        await loadStorefront();
      }
      setView("storefront");
      hideTrialBanner();
      return;
    }
    if (["merchant_owner", "merchant_staff"].includes(state.role)) {
      await loadMerchantData();
      if (state.tenantSlug) await loadStorefront();
    } else if (state.role === "customer" && state.tenantSlug) {
      await loadStorefront();
    }
    if (["platform_owner", "platform_admin"].includes(state.role)) await loadAdmin();
    if (["platform_owner", "platform_admin"].includes(state.role)) {
      setView("admin");
      showMessage("تم فتح لوحة السوبر أدمن.");
    } else if (["merchant_owner", "merchant_staff"].includes(state.role)) {
      setView("catalog");
      showMessage("تم فتح لوحة متجرك.");
    } else {
      setView("overview");
    }
    void refreshLoginSerialDisplay();
  } catch (error) {
    updateNavigation();
    showMessage(error.message, true);
  }
}

function initPasswordToggles(root = document) {
  root.querySelectorAll(".password-input-wrap").forEach((wrap) => {
    const input = wrap.querySelector('input[type="password"], input[type="text"]');
    const btn = wrap.querySelector(".password-toggle");
    if (!input || !btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.classList.toggle("is-visible", show);
      const label = show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور";
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
      input.focus();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyStoreClientShell();
  setOnboardingMode("register");
  void refreshLoginSerialDisplay();
  initPasswordToggles();
  $("app-modal-close")?.addEventListener("click", closeAppModal);
  $("app-modal")?.addEventListener("click", (e) => {
    if (e.target === $("app-modal")) closeAppModal();
  });
  setMerchantTab("overview");
  setAdminTab("overview");
  initDashboardMobileNav();
  initThemeLibraryFilters();
  updateThemePickerUi();
  updateNavigation();
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", async () => {
      setView(button.dataset.view);
    });
  });
  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.authMode) setOnboardingMode(button.dataset.authMode);
      setView(button.dataset.jump);
    });
  });
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setOnboardingMode(button.dataset.authMode);
      // Only guests should navigate to onboarding explicitly.
      if (!button.dataset.jump && currentScope() === "public") setView("onboarding");
    });
  });
  document.querySelectorAll("[data-merchant-jump]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const target = button.dataset.merchantJump;
      if (target === "storefront") {
        setView("storefront");
        return;
      }
      if (target === "products") {
        setMerchantTab("products");
        openProductWizard(1, { reset: true });
        return;
      }
      if (target === "categories") {
        setMerchantTab("categories");
        openCategoryModal();
        return;
      }
      setMerchantTab(target);
    });
  });
  document.querySelectorAll("[data-merchant-tab]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setMerchantTab(button.dataset.merchantTab);
    });
  });
  document.querySelectorAll("[data-merchant-sub]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setMerchantTab(button.dataset.merchantSub);
    });
  });
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setAdminTab(button.dataset.adminTab);
    });
  });
  document.querySelectorAll("[data-admin-jump]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setAdminTab(button.dataset.adminJump);
    });
  });
  $("admin-refresh-overview")?.addEventListener("click", () => loadAdmin());
  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const input = $(button.dataset.copyTarget);
      if (!input?.value) return;
      try {
        await copyTextToClipboard(input.value);
        showMessage("تم النسخ.");
      } catch (error) {
        showMessage(error.message, true);
      }
    });
  });
  fillPaymobCallbackUrls();
  $("admin-tenant-search")?.addEventListener("input", renderAdminTenantsTable);
  $("admin-tenant-status-filter")?.addEventListener("change", renderAdminTenantsTable);
  $("admin-order-status-filter")?.addEventListener("change", () => loadAdminOrders());
  $("admin-orders-refresh")?.addEventListener("click", () => loadAdminOrders());
  $("admin-create-invoice-form")?.addEventListener("submit", createAdminInvoice);
  $("admin-tenant-dialog-close")?.addEventListener("click", () => $("admin-tenant-dialog")?.close());
  // Billing lives inside merchant dashboard; no standalone payments view handlers.
  $("category-filter").addEventListener("input", renderMerchantCategories);
  $("show-category-form").addEventListener("click", openCategoryModal);
  $("cancel-category-form")?.addEventListener("click", () => setCreationForm("category-form", false));
  $("product-filter").addEventListener("input", renderMerchantProducts);
  $("product-filter-category").addEventListener("change", renderMerchantProducts);
  $("product-filter-status").addEventListener("change", renderMerchantProducts);
  $("show-product-form").addEventListener("click", () => openProductWizard(1, { reset: true }));
  $("cancel-product-form")?.addEventListener("click", () => setCreationForm("product-form", false));
  $("add-variant").addEventListener("click", () => addVariantRow());
  $("products-select-all")?.addEventListener("change", (event) => {
    const checked = Boolean(event.currentTarget.checked);
    document.querySelectorAll("[data-product-select]").forEach((input) => (input.checked = checked));
  });
  $("products-bulk-publish")?.addEventListener("click", () => bulkUpdateProductsStatus("published"));
  $("products-bulk-draft")?.addEventListener("click", () => bulkUpdateProductsStatus("draft"));
  $("products-bulk-delete")?.addEventListener("click", () => bulkDeleteProducts());
  $("orders-filter")?.addEventListener("input", renderMerchantOrders);
  $("orders-filter-status")?.addEventListener("change", renderMerchantOrders);
  $("order-dialog-close")?.addEventListener("click", () => $("order-dialog")?.close());
  document.querySelectorAll("#product-form input, #product-form select, #product-form textarea, #category-form input").forEach((element) => {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("focus", (event) => event.stopPropagation());
  });
  $("register-form").addEventListener("submit", registerMerchant);
  $("login-form").addEventListener("submit", login);
  $("category-form").addEventListener("submit", createCategory);
  $("product-form").addEventListener("submit", createProduct);
  $("store-settings-form").addEventListener("submit", saveStoreSettings);
  $("store-logo-file")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const preview = await fileToDataUrl(file);
    renderStoreLogoPreview(preview);
    const sideImg = $("merchant-brand-logo");
    const sideWrap = $("merchant-brand-logo-wrap");
    if (sideImg && sideWrap) {
      sideImg.src = preview;
      sideWrap.hidden = false;
    }
  });
  $("staff-form").addEventListener("submit", createStaff);
  $("password-form").addEventListener("submit", changePassword);
  $("easycash-form").addEventListener("submit", saveEasyCash);
  $("paymob-form").addEventListener("submit", savePaymob);
  $("test-paymob").addEventListener("click", testPaymob);
  $("platform-paymob-form").addEventListener("submit", savePlatformPaymob);
  $("test-platform-paymob").addEventListener("click", testPlatformPaymob);
  $("platform-trial-settings-form")?.addEventListener("submit", savePlatformTrialSettings);
  $("subscription-form").addEventListener("submit", createSubscriptionInvoice);
  $("accounting-link-form")?.addEventListener("submit", saveAccountingLink);
  $("accounting-auto-link-btn")?.addEventListener("click", autoLinkAccounting);
  $("accounting-test-btn")?.addEventListener("click", testAccountingLink);
  $("storefront-form").addEventListener("submit", loadStorefront);
  $("storefront-query")?.addEventListener("input", () => {
    if (!isStoreClientMode()) return;
    clearTimeout(storefrontSearchTimer);
    storefrontSearchTimer = setTimeout(() => {
      void loadStorefront();
    }, 350);
  });
  $("store-cart-fab")?.addEventListener("click", () => setStoreCartOpen(true));
  $("store-cart-toolbar-btn")?.addEventListener("click", () => setStoreCartOpen(true));
  $("store-cart-close")?.addEventListener("click", () => setStoreCartOpen(false));
  $("store-cart-backdrop")?.addEventListener("click", () => setStoreCartOpen(false));
  $("store-account-btn")?.addEventListener("click", () => setStoreAccountOpen(true));
  $("store-account-close")?.addEventListener("click", () => setStoreAccountOpen(false));
  $("store-account-backdrop")?.addEventListener("click", () => setStoreAccountOpen(false));
  initStorefrontDelegation();
  $("order-form").addEventListener("submit", placeOrder);
  $("checkout-settings-form")?.addEventListener("submit", saveCheckoutSettings);
  $("shipping-rates-form")?.addEventListener("submit", saveShippingRates);
  $("tracking-settings-form")?.addEventListener("submit", saveTrackingSettings);
  $("notify-settings-form")?.addEventListener("submit", saveNotifySettings);
  $("domain-settings-form")?.addEventListener("submit", saveDomainSettings);
  $("reviews-settings-form")?.addEventListener("submit", saveReviewsSettings);
  $("store-track-form")?.addEventListener("submit", (e) => submitStoreTrack(e, $("store-track-result")));
  $("customer-track-form")?.addEventListener("submit", (e) => submitStoreTrack(e, $("customer-track-result")));
  $("coupon-form")?.addEventListener("submit", createCoupon);
  $("order-form")?.addEventListener("change", () => void updateCheckoutQuote());
  $("checkout-coupon")?.addEventListener("blur", () => void updateCheckoutQuote());
  $("customer-login-form")?.addEventListener("submit", loginCustomer);
  $("customer-register-form").addEventListener("submit", registerCustomer);
  $("customer-orders-button").addEventListener("click", loadCustomerOrders);
  $("staff-filter")?.addEventListener("input", loadStaff);
  document.querySelectorAll("[data-team-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setTeamTab(btn.dataset.teamTab));
  });
  $("role-matrix-select")?.addEventListener("change", () => void loadRoleMatrix());
  $("role-matrix-save")?.addEventListener("click", async () => {
    const role = $("role-matrix-select")?.value;
    if (!role) return;
    const permissions = readMatrixFromDom($("role-permissions-matrix"), "role");
    await api(`/api/merchant/permissions/roles/${role}`, { method: "PUT", body: JSON.stringify({ permissions }) });
    showMessage("تم حفظ صلاحيات الدور.");
  });
  $("override-user-select")?.addEventListener("change", () => void loadUserOverrides());
  $("override-save")?.addEventListener("click", async () => {
    const userId = $("override-user-select")?.value;
    if (!userId) return;
    const permissions = readMatrixFromDom($("user-overrides-matrix"), "user");
    await api(`/api/merchant/permissions/users/${userId}/overrides`, { method: "PUT", body: JSON.stringify({ permissions }) });
    showMessage("تم حفظ تخصيص الموظف.");
  });
  $("override-clear")?.addEventListener("click", async () => {
    const userId = $("override-user-select")?.value;
    if (!userId || !confirm("إزالة التخصيص والعودة لصلاحيات الدور؟")) return;
    await api(`/api/merchant/permissions/users/${userId}/overrides`, { method: "DELETE", body: JSON.stringify({}) });
    showMessage("تمت إعادة الصلاحيات للدور الافتراضي.");
    await loadUserOverrides();
  });
  $("save-checkout-provider")?.addEventListener("click", saveCheckoutProvider);
  document.querySelectorAll(".theme-tile-select[data-storefront-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      state.storefrontThemeDraft = button.dataset.storefrontTheme;
      updateThemePickerUi();
    });
  });
  document.querySelectorAll(".theme-card-preview").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.dataset.previewFor;
      if (id) openThemePreview(id);
    });
  });
  $("theme-preview-close")?.addEventListener("click", () => $("theme-preview-dialog")?.close());
  $("theme-preview-dialog")?.addEventListener("click", (event) => {
    if (event.target === $("theme-preview-dialog")) $("theme-preview-dialog").close();
  });
  $("save-storefront-theme")?.addEventListener("click", saveStorefrontTheme);
  $("merchant-android-build-request")?.addEventListener("click", () => requestMerchantAndroidBuild());
  $("copy-storefront-web-url")?.addEventListener("click", async () => {
    const value = $("storefront-web-url")?.textContent || "";
    if (!value || value.includes("سيظهر")) return;
    await navigator.clipboard?.writeText(value);
    showMessage("تم نسخ رابط متجر الويب.");
  });
  $("copy-storefront-url")?.addEventListener("click", async () => {
    const value = $("storefront-url")?.textContent || "";
    await navigator.clipboard?.writeText(value);
    showMessage("تم نسخ رابط واجهة المتجر.");
  });
  fillPaymobCallbackUrls();
  document.querySelectorAll(".callback-box input[readonly]").forEach((input) => {
    input.addEventListener("click", async () => {
      await navigator.clipboard?.writeText(input.value);
      showMessage("تم نسخ الرابط.");
    });
  });
  renderCart();
  $("logout").addEventListener("click", () => {
    clearAuthState();
    location.reload();
  });
  bootstrap()
    .then(handlePaymentReturn)
    .then(() => applyStoreDeepLink())
    .catch(() => {});
});
