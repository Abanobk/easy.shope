const state = {
  token: localStorage.getItem("easyShopeToken") || "",
  tenantSlug: localStorage.getItem("easyShopeTenantSlug") || "",
};

const $ = (id) => document.getElementById(id);

function money(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2)} EGP`;
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

async function refreshMe() {
  if (!state.token) return;
  const me = await api("/api/me");
  state.tenantSlug = me.slug || state.tenantSlug;
  localStorage.setItem("easyShopeTenantSlug", state.tenantSlug);
  $("current-user").textContent = `${me.name} (${me.role})`;
  $("tenant-slug").value = state.tenantSlug || "";
}

async function registerMerchant(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const data = await api("/api/auth/register-merchant", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(form.entries())),
  });
  state.token = data.token;
  state.tenantSlug = data.tenant.slug;
  localStorage.setItem("easyShopeToken", state.token);
  localStorage.setItem("easyShopeTenantSlug", state.tenantSlug);
  showMessage("تم تسجيل التاجر وإنشاء المتجر.");
  await bootstrap();
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
  state.token = data.token;
  localStorage.setItem("easyShopeToken", state.token);
  showMessage("تم تسجيل الدخول.");
  await bootstrap();
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
}

async function loadMerchantData() {
  if (!state.token) return;
  const [categories, products, orders, providers, plans] = await Promise.all([
    api("/api/merchant/categories"),
    api("/api/merchant/products"),
    api("/api/merchant/orders"),
    api("/api/merchant/payment-providers"),
    api("/api/plans"),
  ]);

  $("categories").innerHTML = categories.categories.map((item) => `<li>${item.name_ar} / ${item.name_en}</li>`).join("") || "<li>لا توجد تصنيفات بعد.</li>";
  $("products").innerHTML = products.products.map((item) => `<li>${item.title_ar} - ${money(item.price_cents)} - ${item.status}</li>`).join("") || "<li>لا توجد منتجات بعد.</li>";
  $("orders").innerHTML = orders.orders.map((item) => `<li>${item.customer_name} - ${money(item.total_cents)} - ${item.status}</li>`).join("") || "<li>لا توجد طلبات بعد.</li>";
  $("payment-providers").innerHTML = providers.providers.map((item) => `<li>${item.provider} - ${item.mode} - ${item.is_enabled ? "enabled" : "disabled"}</li>`).join("") || "<li>لم يتم ربط دفع بعد.</li>";
  $("planCode").innerHTML = plans.plans.map((plan) => `<option value="${plan.code}">${plan.name} - ${money(plan.price_cents)}</option>`).join("");
}

async function loadStorefront(event) {
  event?.preventDefault();
  const slug = $("tenant-slug").value.trim();
  if (!slug) return showMessage("اكتب slug المتجر أولًا.", true);
  state.tenantSlug = slug;
  localStorage.setItem("easyShopeTenantSlug", slug);
  const data = await api(`/api/store/${slug}/products`);
  $("storefront-products").innerHTML =
    data.products
      .map(
        (item) => `<label class="product-row"><input type="checkbox" value="${item.id}" data-title="${item.title_en}"> <span>${item.title_ar}</span> <code>${money(item.price_cents)}</code></label>`,
      )
      .join("") || "<p>لا توجد منتجات منشورة في هذا المتجر.</p>";
}

async function placeOrder(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const slug = $("tenant-slug").value.trim();
  const items = [...document.querySelectorAll("#storefront-products input:checked")].map((input) => ({
    productId: input.value,
    quantity: 1,
  }));
  if (!items.length) return showMessage("اختر منتجًا واحدًا على الأقل.", true);
  const payload = { ...Object.fromEntries(form.entries()), items };
  const data = await api(`/api/store/${slug}/orders`, { method: "POST", body: JSON.stringify(payload) });
  showMessage(`تم إنشاء الطلب: ${data.order.id}`);
  await loadMerchantData();
}

async function loadAdmin() {
  if (!state.token) return;
  try {
    const [overview, tenants] = await Promise.all([api("/api/admin/overview"), api("/api/admin/tenants")]);
    $("admin-overview").textContent = JSON.stringify(overview, null, 2);
    $("admin-tenants").innerHTML = tenants.tenants.map((tenant) => `<li>${tenant.name_en} - ${tenant.slug} - ${tenant.status}</li>`).join("");
  } catch {
    $("admin-overview").textContent = "سجل دخول كسوبر أدمن لعرض هذا القسم.";
  }
}

async function bootstrap() {
  try {
    const health = await api("/api/health");
    $("api-status").textContent = health.ok ? "ok" : "error";
    $("api-dot").classList.toggle("ok", Boolean(health.ok));
    await refreshMe();
    await loadMerchantData();
    await loadStorefront();
    await loadAdmin();
  } catch (error) {
    showMessage(error.message, true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("register-form").addEventListener("submit", registerMerchant);
  $("login-form").addEventListener("submit", login);
  $("category-form").addEventListener("submit", createCategory);
  $("product-form").addEventListener("submit", createProduct);
  $("easycash-form").addEventListener("submit", saveEasyCash);
  $("subscription-form").addEventListener("submit", createSubscriptionInvoice);
  $("storefront-form").addEventListener("submit", loadStorefront);
  $("order-form").addEventListener("submit", placeOrder);
  $("logout").addEventListener("click", () => {
    localStorage.removeItem("easyShopeToken");
    localStorage.removeItem("easyShopeTenantSlug");
    location.reload();
  });
  bootstrap();
});
