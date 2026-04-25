const state = {
  token: localStorage.getItem("easyShopeToken") || "",
  tenantSlug: localStorage.getItem("easyShopeTenantSlug") || "",
  role: localStorage.getItem("easyShopeRole") || "",
  customerToken: localStorage.getItem("easyShopeCustomerToken") || "",
  cart: [],
  storefrontCategory: "",
  merchantCategories: [],
  merchantProducts: [],
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.size) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("تعذر قراءة الملف."));
    reader.readAsDataURL(file);
  });
}

function parseMoneyToCents(value) {
  return Math.round(Number(value || 0) * 100);
}

function productPriceHtml(product) {
  const compareAt = Number(product.compare_at_price_cents || 0);
  const discount = Number(product.discount_percent || 0);
  return `<code>${money(product.price_cents)}</code>${compareAt ? `<small class="old-price">${money(compareAt)}</small>` : ""}${discount ? `<small class="discount-badge">خصم ${discount}%</small>` : ""}`;
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
  if (processed) processed.value = `${origin}/api/webhooks/paymob`;
  if (response) response.value = `${origin}/?payment=paymob`;
}

function clearAuthState() {
  state.token = "";
  state.role = "";
  state.tenantSlug = "";
  localStorage.removeItem("easyShopeToken");
  localStorage.removeItem("easyShopeTenantSlug");
  localStorage.removeItem("easyShopeRole");
  if ($("current-user")) $("current-user").textContent = "guest";
  updateNavigation();
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
  if (!response.ok) {
    if (response.status === 401 && path !== "/api/auth/login") {
      clearAuthState();
      setOnboardingMode("login");
      setView("onboarding");
    }
    const baseMessage = response.status === 401 ? "انتهت جلسة تسجيل الدخول. سجّل دخول كتاجر مرة أخرى ثم أعد إنشاء الفاتورة." : data.message || `Request failed: ${response.status}`;
    const error = new Error(data.hint ? `${baseMessage} - ${data.hint}` : baseMessage);
    error.details = data.details;
    throw error;
  }
  return data;
}

async function customerApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.customerToken ? { Authorization: `Bearer ${state.customerToken}` } : {}),
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
  document.body.dataset.scope = scope;
  document.querySelectorAll(".nav-item").forEach((button) => {
    const scopes = (button.dataset.scope || "public").split(",");
    button.hidden = !scopes.includes(scope);
  });
  $("logout").hidden = scope === "public";
  if ($("merchant-summary")) $("merchant-summary").hidden = scope !== "merchant";
}

function setOnboardingMode(mode = "register") {
  document.body.dataset.authMode = mode === "login" ? "login" : "register";
}

function setMerchantTab(tab = "overview") {
  document.querySelectorAll("[data-merchant-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.merchantTab === tab);
  });
  document.querySelectorAll("[data-merchant-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.merchantPanel === tab);
  });
}

function setView(view) {
  updateNavigation();
  const navButton = document.querySelector(`[data-view="${view}"]`);
  if (navButton?.hidden || !$(`view-${view}`)) {
    view = defaultViewForScope();
  }
  document.body.dataset.view = view;
  document.querySelectorAll(".view").forEach((element) => element.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((element) => element.classList.remove("active"));
  $(`view-${view}`)?.classList.add("active");
  document.querySelector(`[data-view="${view}"]`)?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function refreshMe() {
  if (!state.token) {
    state.role = "";
    $("current-user").textContent = "guest";
    updateNavigation();
    return;
  }
  const me = await api("/api/me");
  state.role = me.role;
  state.tenantSlug = me.slug || state.tenantSlug;
  localStorage.setItem("easyShopeRole", state.role);
  localStorage.setItem("easyShopeTenantSlug", state.tenantSlug);
  $("current-user").textContent = `${me.name} (${me.role})`;
  $("tenant-slug").value = state.tenantSlug || "";
  if ($("overview-slug")) $("overview-slug").textContent = state.tenantSlug || "غير محدد";
  updateNavigation();
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
    $("register-result").innerHTML = `<strong>تم إنشاء المتجر</strong><p>Store slug: ${data.tenant.slug}</p><p>تم تسجيل الدخول كتاجر.</p>`;
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
    localStorage.setItem("easyShopeToken", state.token);
    localStorage.setItem("easyShopeRole", state.role);
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

async function createCategory(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  const imageUrl = await fileToDataUrl(form.get("imageFile"));
  delete payload.imageFile;
  if (imageUrl) payload.imageUrl = imageUrl;
  await api("/api/merchant/categories", { method: "POST", body: JSON.stringify(payload) });
  showMessage("تم إنشاء التصنيف.");
  event.currentTarget.reset();
  await loadMerchantData();
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
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  const imageFiles = form.getAll("imageFiles").filter((file) => file?.size);
  const mediaUrls = await Promise.all(imageFiles.map((file) => fileToDataUrl(file)));
  const uploadedVideo = await fileToDataUrl(form.get("videoFile"));
  payload.priceCents = parseMoneyToCents(payload.price);
  if (payload.compareAtPrice) payload.compareAtPriceCents = parseMoneyToCents(payload.compareAtPrice);
  payload.discountPercent = Number(payload.discountPercent || 0);
  payload.stockQuantity = Number(payload.stockQuantity || 0);
  payload.mediaUrls = mediaUrls.filter(Boolean);
  payload.imageUrl = payload.mediaUrls[0] || "";
  payload.videoUrl = uploadedVideo || payload.videoUrl || "";
  payload.variants = collectVariants();
  delete payload.price;
  delete payload.compareAtPrice;
  delete payload.imageFiles;
  delete payload.videoFile;
  if (!payload.categoryId) delete payload.categoryId;
  if (!payload.imageUrl) delete payload.imageUrl;
  if (!payload.videoUrl) delete payload.videoUrl;
  await api("/api/merchant/products", { method: "POST", body: JSON.stringify(payload) });
  showMessage("تم إنشاء المنتج.");
  event.currentTarget.reset();
  resetVariants();
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

async function createStaff(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  try {
    button.disabled = true;
    button.textContent = "جارٍ إضافة الموظف...";
    const form = new FormData(event.currentTarget);
    await api("/api/merchant/staff", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
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
  showMessage(data.ok ? "Paymob connection ok." : "Paymob connection failed.", !data.ok);
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

async function testPlatformPaymob() {
  const data = await api("/api/admin/payment-providers/paymob/test", { method: "POST", body: JSON.stringify({}) });
  showMessage(data.ok ? "Platform Paymob connection ok." : "Platform Paymob connection failed.", !data.ok);
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
  $("planCode").innerHTML = plans.plans.map((plan) => `<option value="${plan.code}">${plan.name} - ${money(plan.price_cents)}</option>`).join("");
}

async function loadMerchantData() {
  if (!state.token || !state.tenantSlug || ["platform_owner", "platform_admin"].includes(state.role)) return;
  const [dashboard, categories, products, orders, providers, billing] = await Promise.all([
    api("/api/merchant/dashboard"),
    api("/api/merchant/categories"),
    api("/api/merchant/products"),
    api("/api/merchant/orders"),
    api("/api/merchant/payment-providers"),
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
  $("catalog-categories-total").textContent = dashboard.categories.total;
  const maxChartValue = Math.max(Number(dashboard.products.total || 0), Number(dashboard.revenue.count || 0), Number(dashboard.revenue.total_cents || 0) / 100, 1);
  $("chart-products-bar").style.setProperty("--value", `${Math.max(10, (Number(dashboard.products.total || 0) / maxChartValue) * 100)}%`);
  $("chart-orders-bar").style.setProperty("--value", `${Math.max(10, (Number(dashboard.revenue.count || 0) / maxChartValue) * 100)}%`);
  $("chart-revenue-bar").style.setProperty("--value", `${Math.max(10, ((Number(dashboard.revenue.total_cents || 0) / 100) / maxChartValue) * 100)}%`);
  fillStoreSettings(dashboard.tenant);
  $("merchant-latest-orders").innerHTML =
    dashboard.latestOrders.map((order) => `<li><strong>${order.customer_name}</strong><span>${money(order.total_cents)} - ${order.status}</span></li>`).join("") ||
    "<li>لا توجد طلبات حديثة.</li>";
  state.merchantCategories = categories.categories || [];
  state.merchantProducts = products.products || [];
  $("product-category").innerHTML =
    `<option value="">بدون تصنيف</option>` + categories.categories.map((item) => `<option value="${item.id}">${item.name_ar}</option>`).join("");
  $("product-filter-category").innerHTML =
    `<option value="">كل الأصناف</option>` + categories.categories.map((item) => `<option value="${item.id}">${item.name_ar}</option>`).join("");
  renderMerchantCategories();
  renderMerchantProducts();
  $("orders").innerHTML =
    orders.orders
      .map(
        (item) => `<li>
          <strong>${item.customer_name}<small>${money(item.total_cents)} - دفع: ${item.payment_status}</small></strong>
          <span class="row-actions">
            <button data-order-details="${item.id}">تفاصيل</button>
            <button data-order-status="${item.id}:processing">تجهيز</button>
            <button data-order-status="${item.id}:shipped">شحن</button>
            <button class="success-button" data-order-status="${item.id}:delivered">تسليم</button>
            <button class="danger-button" data-order-status="${item.id}:cancelled">إلغاء</button>
          </span>
        </li>`,
      )
      .join("") || "<li>لا توجد طلبات بعد.</li>";
  $("payment-providers").innerHTML =
    providers.providers
      .map(
        (item) =>
          `<li><strong>${item.provider}</strong><span>${item.mode} - ${item.is_enabled ? "enabled" : "disabled"} ${
            item.provider === "paymob" ? `- card ${item.public_config.cardIntegrationId || ""}` : ""
          }</span></li>`,
      )
      .join("") || "<li>لم يتم ربط دفع بعد.</li>";
  await loadPlans();
  renderBilling(dashboard.tenant, billing.invoices);
  bindMerchantActions("orders");
  await loadStaff();
}

function renderMerchantCategories() {
  const filter = $("category-filter")?.value.trim().toLowerCase() || "";
  const rows = state.merchantCategories.filter((item) => `${item.name_ar} ${item.name_en}`.toLowerCase().includes(filter));
  $("categories").innerHTML =
    rows
      .map(
        (item) => `<li>
          <strong>${item.image_url ? `<img class="list-thumb" src="${item.image_url}" alt="">` : ""}${item.name_ar}<small>${item.name_en}</small></strong>
          <span>${item.slug}</span>
        </li>`,
      )
      .join("") || "<li>لا توجد تصنيفات مطابقة.</li>";
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
  $("products").innerHTML =
    rows
      .map((item) => {
        const variantCount = Array.isArray(item.variants) ? item.variants.length : 0;
        const hasVideo = Boolean(item.video_url);
        return `<li>
          <strong>${item.image_url ? `<img class="list-thumb" src="${item.image_url}" alt="">` : ""}${item.title_ar}
            <small>${money(item.price_cents)}${item.discount_percent ? ` - خصم ${item.discount_percent}%` : ""} - مخزون ${item.stock_quantity} - ${categoryById.get(item.category_id) || "بدون تصنيف"}${variantCount ? ` - ${variantCount} خيار` : ""}${hasVideo ? " - فيديو" : ""}</small>
          </strong>
          <span class="row-actions">
            <button data-product-status="${item.id}:${item.status === "published" ? "draft" : "published"}">${item.status === "published" ? "إخفاء" : "نشر"}</button>
            <button class="danger-button" data-product-delete="${item.id}">حذف</button>
          </span>
        </li>`;
      })
      .join("") || "<li>لا توجد منتجات مطابقة.</li>";
  bindMerchantActions("products");
}

async function loadStaff() {
  const staffList = $("staff-list");
  if (!staffList) return;
  if (state.role !== "merchant_owner") {
    staffList.innerHTML = "<li>إدارة الموظفين متاحة لصاحب المتجر فقط.</li>";
    $("staff-form")?.querySelectorAll("input, button").forEach((element) => {
      element.disabled = true;
    });
    return;
  }
  $("staff-form")?.querySelectorAll("input, button").forEach((element) => {
    element.disabled = false;
  });
  const data = await api("/api/merchant/staff");
  staffList.innerHTML =
    data.staff
      .map(
        (member) => `<li>
          <strong>${member.name}<small>${member.email} - ${member.status}</small></strong>
          <span class="row-actions">
            <button data-staff-status="${member.id}:${member.status === "active" ? "disabled" : "active"}">${member.status === "active" ? "تعطيل" : "تفعيل"}</button>
            <button class="danger-button" data-staff-delete="${member.id}">حذف</button>
          </span>
        </li>`,
      )
      .join("") || "<li>لا يوجد موظفون بعد.</li>";
  bindStaffActions();
}

function bindStaffActions() {
  document.querySelectorAll("[data-staff-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [staffId, status] = button.dataset.staffStatus.split(":");
      await api(`/api/merchant/staff/${staffId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      showMessage(`تم تحديث الموظف إلى ${status}.`);
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
  }
  if (scope === "products") return;
  document.querySelectorAll("[data-order-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [orderId, status] = button.dataset.orderStatus.split(":");
      await api(`/api/merchant/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      showMessage(`تم تحديث الطلب إلى ${status}.`);
      await loadMerchantData();
    });
  });
  document.querySelectorAll("[data-order-details]").forEach((button) => {
    button.addEventListener("click", async () => {
      const data = await api(`/api/merchant/orders/${button.dataset.orderDetails}`);
      $("message").className = "message ok";
      $("message").innerHTML = `<strong>طلب ${data.order.id}</strong><br>${data.items
        .map((item) => `${item.title} x ${item.quantity} = ${money(item.total_cents)}`)
        .join("<br>")}`;
    });
  });
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
          <div class="product-card-footer"><div class="price-stack">${productPriceHtml(item)}</div><div class="row-actions">
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
  $("checkout-result").innerHTML = `<strong>تم إنشاء الطلب بنجاح</strong><p>رقم الطلب: ${data.order.id}</p><p>حالة الدفع: ${data.payment.status}</p>${
    data.payment.checkoutUrl ? `<p><a class="button" href="${data.payment.checkoutUrl}" target="_blank" rel="noopener">ادفع الآن عبر Paymob</a></p>` : ""
  }`;
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

async function loadCustomerOrders() {
  if (!state.customerToken) return showMessage("أنشئ حساب عميل أولًا لعرض الطلبات.", true);
  try {
    const data = await customerApi("/api/customer/orders");
    $("customer-orders").innerHTML =
      data.orders.map((order) => `<li><strong>${money(order.total_cents)}</strong><span>${order.status} - ${order.payment_status}</span></li>`).join("") ||
      "<li>لا توجد طلبات لهذا العميل بعد.</li>";
  } catch (error) {
    showMessage(error.message, true);
  }
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
      const variants = Array.isArray(data.product.variants) ? data.product.variants : [];
      $("product-detail").innerHTML = `${productMediaHtml(data.product)}<strong>${data.product.title_ar}</strong><p>${data.product.description || "لا يوجد وصف."}</p><div class="price-stack">${productPriceHtml(data.product)}</div><p>${data.product.stock_quantity} في المخزون</p>${
        variants.length
          ? `<div class="variant-pills">${variants
              .map((variant) => `<span>${variant.type || "نوع"} ${variant.color || ""}${variant.extraPriceCents ? ` + ${money(variant.extraPriceCents)}` : ""}${variant.stockQuantity !== null && variant.stockQuantity !== undefined ? ` - مخزون ${variant.stockQuantity}` : ""}</span>`)
              .join("")}</div>`
          : ""
      }`;
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
  const activeText = store.status === "active" ? "الخدمة مفعلة" : store.status === "trial" ? "فترة تجربة / بانتظار الاشتراك" : store.status;
  $("subscription-status").innerHTML = `<strong>${activeText}</strong><p>الخطة: ${store.plan_code} - ينتهي: ${store.subscription_expires_at || "غير محدد"}</p>`;
  $("subscription-invoices").innerHTML =
    invoices
      .map(
        (invoice) => `<li><strong>${invoice.plan_name || invoice.plan_code} - ${money(invoice.amount_cents)}<small>${invoice.provider || ""} ${invoice.provider_reference || ""}</small></strong><span>${invoice.status} ${
          invoice.status === "paid" ? "" : `<button class="mini-button" data-pay-invoice="${invoice.id}">دفع Paymob</button>`
        }</span></li>`,
      )
      .join("") || "<li>لا توجد فواتير اشتراك بعد.</li>";
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
    setView("payments");
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

async function loadAdmin() {
  if (!state.token) return;
  try {
    const [overview, tenants, plans, invoices, platformProviders] = await Promise.all([
      api("/api/admin/overview"),
      api("/api/admin/tenants"),
      api("/api/admin/plans"),
      api("/api/admin/subscription-invoices"),
      api("/api/admin/payment-providers"),
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
    renderPlatformProviders(platformProviders.providers);
    $("admin-invoices-table").innerHTML =
      invoices.invoices
        .map(
          (invoice) => `<tr>
            <td><strong>${invoice.tenant_name}</strong><br><small>${invoice.tenant_slug}</small></td>
            <td>${invoice.plan_code}</td>
            <td>${money(invoice.amount_cents)}</td>
            <td>${invoice.status}<br><small>${invoice.provider || ""} ${invoice.provider_reference || ""}</small></td>
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

function renderPlatformProviders(providers) {
  const paymob = providers.find((provider) => provider.provider === "paymob");
  $("platform-paymob-status").innerHTML = paymob
    ? `<strong>${paymob.is_enabled ? "Paymob مفعل" : "Paymob محفوظ وغير مفعل"}</strong><p>${paymob.mode} - card ${
        paymob.public_config.cardIntegrationId || "غير محدد"
      } - key ${paymob.public_config.publicKeyLast8 || ""}</p>`
    : "<strong>Paymob غير مضاف</strong><p>أدخل مفاتيح حسابك حتى يدفع التجار اشتراكات المنصة لك.</p>";
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
  } catch (error) {
    updateNavigation();
    showMessage(error.message, true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setOnboardingMode("register");
  setMerchantTab("overview");
  updateNavigation();
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", async () => {
      setView(button.dataset.view);
      if (button.dataset.view === "payments" && !["platform_owner", "platform_admin"].includes(state.role)) {
        await loadPlans();
        await loadBillingData();
      }
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
      if (!button.dataset.jump) setView("onboarding");
    });
  });
  document.querySelectorAll("[data-merchant-tab]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setMerchantTab(button.dataset.merchantTab);
    });
  });
  $("category-filter").addEventListener("input", renderMerchantCategories);
  $("product-filter").addEventListener("input", renderMerchantProducts);
  $("product-filter-category").addEventListener("change", renderMerchantProducts);
  $("product-filter-status").addEventListener("change", renderMerchantProducts);
  $("add-variant").addEventListener("click", () => addVariantRow());
  $("register-form").addEventListener("submit", registerMerchant);
  $("login-form").addEventListener("submit", login);
  $("category-form").addEventListener("submit", createCategory);
  $("product-form").addEventListener("submit", createProduct);
  $("store-settings-form").addEventListener("submit", saveStoreSettings);
  $("staff-form").addEventListener("submit", createStaff);
  $("password-form").addEventListener("submit", changePassword);
  $("easycash-form").addEventListener("submit", saveEasyCash);
  $("paymob-form").addEventListener("submit", savePaymob);
  $("test-paymob").addEventListener("click", testPaymob);
  $("platform-paymob-form").addEventListener("submit", savePlatformPaymob);
  $("test-platform-paymob").addEventListener("click", testPlatformPaymob);
  $("subscription-form").addEventListener("submit", createSubscriptionInvoice);
  $("storefront-form").addEventListener("submit", loadStorefront);
  $("order-form").addEventListener("submit", placeOrder);
  $("customer-register-form").addEventListener("submit", registerCustomer);
  $("customer-orders-button").addEventListener("click", loadCustomerOrders);
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
  bootstrap().then(handlePaymentReturn);
});
