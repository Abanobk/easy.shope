const state = {
  token: localStorage.getItem("easyShopeToken") || "",
  tenantSlug: localStorage.getItem("easyShopeTenantSlug") || "",
  role: localStorage.getItem("easyShopeRole") || "",
  cart: [],
  storefrontCategory: "",
};

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

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed: ${response.status}`);
  return data;
}

function showMessage(message, isError = false) {
  $("message").textContent = message;
  $("message").className = isError ? "message error" : "message ok";
}

function setView(view) {
  document.querySelectorAll(".view").forEach((element) => element.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((element) => element.classList.remove("active"));
  $(`view-${view}`)?.classList.add("active");
  document.querySelector(`[data-view="${view}"]`)?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function refreshMe() {
  if (!state.token) return;
  const me = await api("/api/me");
  state.role = me.role;
  state.tenantSlug = me.slug || state.tenantSlug;
  localStorage.setItem("easyShopeRole", state.role);
  localStorage.setItem("easyShopeTenantSlug", state.tenantSlug);
  $("current-user").textContent = `${me.name} (${me.role})`;
  $("tenant-slug").value = state.tenantSlug || "";
  $("overview-slug").textContent = state.tenantSlug || "غير محدد";
}

async function registerMerchant(event) {
  event.preventDefault();
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
  showMessage("تم تسجيل التاجر وإنشاء المتجر.");
  await bootstrap();
  setView("catalog");
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
  state.token = data.token;
  state.role = data.user.role;
  localStorage.setItem("easyShopeToken", state.token);
  localStorage.setItem("easyShopeRole", state.role);
  showMessage("تم تسجيل الدخول.");
  await bootstrap();
  setView(["platform_owner", "platform_admin"].includes(state.role) ? "admin" : "overview");
}

async function createCategory(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/api/merchant/categories", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
  showMessage("تم إنشاء التصنيف.");
  event.currentTarget.reset();
  await loadMerchantData();
}

async function createProduct(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  payload.priceCents = Math.round(Number(payload.price) * 100);
  payload.stockQuantity = Number(payload.stockQuantity || 0);
  delete payload.price;
  if (!payload.categoryId) delete payload.categoryId;
  await api("/api/merchant/products", { method: "POST", body: JSON.stringify(payload) });
  showMessage("تم إنشاء المنتج.");
  event.currentTarget.reset();
  await loadMerchantData();
}

async function saveStoreSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim()));
  const data = await api("/api/merchant/store", { method: "PATCH", body: JSON.stringify(payload) });
  showMessage("تم حفظ إعدادات المتجر.");
  fillStoreSettings(data.store);
  await refreshMe();
}

function fillStoreSettings(store) {
  if (!store) return;
  $("store-name-ar").value = store.name_ar || "";
  $("store-name-en").value = store.name_en || "";
  $("store-country").value = store.country || "";
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

async function createSubscriptionInvoice(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const data = await api("/api/merchant/subscription-invoices", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
  showMessage(`تم إنشاء فاتورة اشتراك: ${data.invoice.id}`);
  await loadBillingData();
}

async function loadMerchantData() {
  if (!state.token || !state.tenantSlug || ["platform_owner", "platform_admin"].includes(state.role)) return;
  const [dashboard, categories, products, orders, providers, plans, billing] = await Promise.all([
    api("/api/merchant/dashboard"),
    api("/api/merchant/categories"),
    api("/api/merchant/products"),
    api("/api/merchant/orders"),
    api("/api/merchant/payment-providers"),
    api("/api/plans"),
    api("/api/merchant/subscription-invoices"),
  ]);

  $("merchant-products-total").textContent = dashboard.products.total;
  $("merchant-products-published").textContent = `${dashboard.products.published} منشور`;
  $("merchant-categories-total").textContent = dashboard.categories.total;
  $("merchant-orders-total").textContent = dashboard.revenue.count;
  $("merchant-revenue-total").textContent = money(dashboard.revenue.total_cents);
  $("catalog-products-total").textContent = dashboard.products.total;
  $("catalog-products-published").textContent = `${dashboard.products.published} منشور`;
  $("catalog-orders-total").textContent = dashboard.revenue.count;
  $("catalog-revenue-total").textContent = money(dashboard.revenue.total_cents);
  fillStoreSettings(dashboard.tenant);
  $("merchant-latest-orders").innerHTML =
    dashboard.latestOrders.map((order) => `<li><strong>${order.customer_name}</strong><span>${money(order.total_cents)} - ${order.status}</span></li>`).join("") ||
    "<li>لا توجد طلبات حديثة.</li>";
  $("categories").innerHTML = categories.categories.map((item) => `<li><strong>${item.name_ar}</strong><span>${item.name_en}</span></li>`).join("") || "<li>لا توجد تصنيفات بعد.</li>";
  $("products").innerHTML = products.products.map((item) => `<li><strong>${item.title_ar}</strong><span>${money(item.price_cents)} - ${item.status}</span></li>`).join("") || "<li>لا توجد منتجات بعد.</li>";
  $("orders").innerHTML = orders.orders.map((item) => `<li><strong>${item.customer_name}</strong><span>${money(item.total_cents)} - ${item.status}</span></li>`).join("") || "<li>لا توجد طلبات بعد.</li>";
  $("payment-providers").innerHTML = providers.providers.map((item) => `<li><strong>${item.provider}</strong><span>${item.mode} - ${item.is_enabled ? "enabled" : "disabled"}</span></li>`).join("") || "<li>لم يتم ربط دفع بعد.</li>";
  $("planCode").innerHTML = plans.plans.map((plan) => `<option value="${plan.code}">${plan.name} - ${money(plan.price_cents)}</option>`).join("");
  renderBilling(dashboard.tenant, billing.invoices);
}

async function loadStorefront(event) {
  event?.preventDefault();
  const slug = $("tenant-slug").value.trim();
  if (!slug) {
    $("storefront-products").innerHTML = "<p>بعد تسجيل التاجر سيظهر slug المتجر هنا تلقائيًا.</p>";
    return;
  }
  state.tenantSlug = slug;
  localStorage.setItem("easyShopeTenantSlug", slug);
  const store = await api(`/api/store/${slug}`);
  const data = await api(`/api/store/${slug}/products${queryString({ q: $("storefront-query").value.trim(), category: state.storefrontCategory })}`);
  $("storefront-title").textContent = store.store.name_ar || store.store.name_en;
  $("storefront-subtitle").textContent = `${store.store.name_en} - ${store.store.country} - ${store.store.status}`;
  $("storefront-categories").innerHTML =
    [`<button class="${state.storefrontCategory ? "" : "active"}" data-store-category="">الكل</button>`]
      .concat(store.categories.map((category) => `<button class="${state.storefrontCategory === category.slug ? "active" : ""}" data-store-category="${category.slug}">${category.name_ar} (${category.products_count})</button>`))
      .join("");
  $("storefront-products").innerHTML =
    data.products
      .map(
        (item) => `<article class="store-product-card">
          <div class="product-image">${item.image_url ? `<img src="${item.image_url}" alt="">` : `<span>${item.title_ar.slice(0, 1)}</span>`}</div>
          <div><strong>${item.title_ar}</strong><p>${item.description || "منتج متاح في المتجر."}</p></div>
          <div class="product-card-footer"><code>${money(item.price_cents)}</code><div class="row-actions">
            <button data-view-product="${item.slug}">تفاصيل</button>
            <button class="success-button" data-add-cart="${item.id}" data-title="${item.title_ar}" data-price="${item.price_cents}">أضف للسلة</button>
          </div></div>
        </article>`,
      )
      .join("") || "<p>لا توجد منتجات منشورة في هذا المتجر.</p>";
  bindStorefrontActions();
}

async function placeOrder(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const slug = $("tenant-slug").value.trim();
  const items = state.cart.map((item) => ({ productId: item.productId, quantity: item.quantity }));
  if (!items.length) return showMessage("اختر منتجًا واحدًا على الأقل.", true);
  const payload = { ...Object.fromEntries(form.entries()), items };
  const data = await api(`/api/store/${slug}/orders`, { method: "POST", body: JSON.stringify(payload) });
  showMessage(`تم إنشاء الطلب: ${data.order.id}`);
  $("checkout-result").innerHTML = `<strong>تم إنشاء الطلب بنجاح</strong><p>رقم الطلب: ${data.order.id}</p><p>حالة الدفع: ${data.payment.status}</p>`;
  state.cart = [];
  renderCart();
  if (!["platform_owner", "platform_admin"].includes(state.role)) await loadMerchantData();
}

function bindStorefrontActions() {
  document.querySelectorAll("[data-store-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.storefrontCategory = button.dataset.storeCategory;
      await loadStorefront();
    });
  });
  document.querySelectorAll("[data-add-cart]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.addCart, button.dataset.title, Number(button.dataset.price)));
  });
  document.querySelectorAll("[data-view-product]").forEach((button) => {
    button.addEventListener("click", async () => {
      const slug = $("tenant-slug").value.trim();
      const data = await api(`/api/store/${slug}/products/${button.dataset.viewProduct}`);
      $("product-detail").innerHTML = `<strong>${data.product.title_ar}</strong><p>${data.product.description || "لا يوجد وصف."}</p><p>${money(data.product.price_cents)} - ${data.product.stock_quantity} في المخزون</p>`;
    });
  });
}

function addToCart(productId, title, priceCents) {
  const existing = state.cart.find((item) => item.productId === productId);
  if (existing) existing.quantity += 1;
  else state.cart.push({ productId, title, priceCents, quantity: 1 });
  renderCart();
}

function renderCart() {
  $("cart-items").innerHTML =
    state.cart
      .map(
        (item) => `<li><strong>${item.title} x ${item.quantity}</strong><span>${money(item.priceCents * item.quantity)} <button class="mini-button" data-remove-cart="${item.productId}">حذف</button></span></li>`,
      )
      .join("") || "<li>السلة فارغة.</li>";
  $("cart-total").textContent = money(state.cart.reduce((total, item) => total + item.priceCents * item.quantity, 0));
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

function renderBilling(store, invoices) {
  $("subscription-status").innerHTML = `<strong>${store.status}</strong><p>الخطة: ${store.plan_code} - ينتهي: ${store.subscription_expires_at || "غير محدد"}</p>`;
  $("subscription-invoices").innerHTML =
    invoices
      .map(
        (invoice) => `<li><strong>${invoice.plan_name || invoice.plan_code} - ${money(invoice.amount_cents)}</strong><span>${invoice.status} <button class="mini-button" data-pay-invoice="${invoice.id}">دفع EasyCash</button></span></li>`,
      )
      .join("") || "<li>لا توجد فواتير اشتراك بعد.</li>";
  document.querySelectorAll("[data-pay-invoice]").forEach((button) => {
    button.addEventListener("click", async () => {
      const data = await api(`/api/merchant/subscription-invoices/${button.dataset.payInvoice}/pay`, { method: "POST", body: JSON.stringify({}) });
      showMessage(`تم تجهيز دفع EasyCash: ${data.payment.status}`);
      await loadBillingData();
    });
  });
}

async function loadAdmin() {
  if (!state.token) return;
  try {
    const [overview, tenants, plans, invoices] = await Promise.all([
      api("/api/admin/overview"),
      api("/api/admin/tenants"),
      api("/api/admin/plans"),
      api("/api/admin/subscription-invoices"),
    ]);
    $("admin-tenants-total").textContent = sumRows(overview.tenants);
    $("admin-tenants-active").textContent = `${statusCount(overview.tenants, "active")} active`;
    $("admin-orders-total").textContent = overview.orders.count;
    $("admin-revenue-total").textContent = money(overview.orders.total_cents);
    $("admin-invoices-total").textContent = sumRows(overview.subscriptionInvoices);
    $("admin-invoices-paid").textContent = `${statusCount(overview.subscriptionInvoices, "paid")} paid`;
    $("admin-tenants-table").innerHTML =
      tenants.tenants
        .map(
          (tenant) => `<tr>
            <td><strong>${tenant.name_en}</strong><br><small>${tenant.slug}</small></td>
            <td>${tenant.status}</td>
            <td>${tenant.plan_code}</td>
            <td>${tenant.products_count} منتجات / ${tenant.orders_count} طلب / ${money(tenant.revenue_cents)}</td>
            <td><div class="row-actions">
              <button class="success-button" data-tenant-status="${tenant.id}:active">تفعيل</button>
              <button class="danger-button" data-tenant-status="${tenant.id}:suspended">تعليق</button>
              <button data-tenant-extend="${tenant.id}">+ شهر</button>
            </div></td>
          </tr>`,
        )
        .join("") || `<tr><td colspan="5">لا توجد متاجر بعد.</td></tr>`;
    $("admin-plans").innerHTML = plans.plans
      .map(
        (plan) => `<div class="plan-card">
          <div><strong>${plan.name}</strong><br><small>${plan.duration_months} شهر - ${plan.is_active ? "active" : "inactive"}</small></div>
          <div class="row-actions">
            <input type="number" value="${(plan.price_cents / 100).toFixed(2)}" data-plan-price="${plan.code}">
            <button data-plan-save="${plan.code}">حفظ</button>
          </div>
        </div>`,
      )
      .join("");
    $("admin-invoices-table").innerHTML =
      invoices.invoices
        .map(
          (invoice) => `<tr>
            <td><strong>${invoice.tenant_name}</strong><br><small>${invoice.tenant_slug}</small></td>
            <td>${invoice.plan_code}</td>
            <td>${money(invoice.amount_cents)}</td>
            <td>${invoice.status}</td>
            <td><div class="row-actions">
              <button class="success-button" data-invoice-status="${invoice.id}:paid">Paid</button>
              <button data-invoice-status="${invoice.id}:expired">Expired</button>
              <button class="danger-button" data-invoice-status="${invoice.id}:failed">Failed</button>
            </div></td>
          </tr>`,
        )
        .join("") || `<tr><td colspan="5">لا توجد فواتير بعد.</td></tr>`;
    bindAdminActions();
  } catch {
    $("admin-tenants-table").innerHTML = `<tr><td colspan="5">سجل دخول كسوبر أدمن لعرض هذا القسم.</td></tr>`;
  }
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
  document.querySelectorAll("[data-plan-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = button.dataset.planSave;
      const input = document.querySelector(`[data-plan-price="${code}"]`);
      await api(`/api/admin/plans/${code}`, { method: "PATCH", body: JSON.stringify({ priceCents: Math.round(Number(input.value) * 100) }) });
      showMessage("تم تحديث الخطة.");
      await loadAdmin();
    });
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
    const health = await api("/api/health");
    $("api-status").textContent = health.ok ? "API online" : "API error";
    $("overview-api").textContent = health.ok ? "online" : "error";
    $("overview-api").className = health.ok ? "ok" : "";
    $("overview-db").textContent = health.db === false ? "checking" : "online";
    $("overview-db").className = "ok";
    $("api-dot").classList.toggle("ok", Boolean(health.ok));
    await refreshMe();
    if (!["platform_owner", "platform_admin"].includes(state.role)) {
      await loadMerchantData();
      if (state.tenantSlug) await loadStorefront();
    }
    await loadAdmin();
    if (["platform_owner", "platform_admin"].includes(state.role)) {
      setView("admin");
      showMessage("تم فتح لوحة السوبر أدمن.");
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.jump));
  });
  $("register-form").addEventListener("submit", registerMerchant);
  $("login-form").addEventListener("submit", login);
  $("category-form").addEventListener("submit", createCategory);
  $("product-form").addEventListener("submit", createProduct);
  $("store-settings-form").addEventListener("submit", saveStoreSettings);
  $("easycash-form").addEventListener("submit", saveEasyCash);
  $("subscription-form").addEventListener("submit", createSubscriptionInvoice);
  $("storefront-form").addEventListener("submit", loadStorefront);
  $("order-form").addEventListener("submit", placeOrder);
  renderCart();
  $("logout").addEventListener("click", () => {
    localStorage.removeItem("easyShopeToken");
    localStorage.removeItem("easyShopeTenantSlug");
    localStorage.removeItem("easyShopeRole");
    location.reload();
  });
  bootstrap();
});
