const state = {
  token: localStorage.getItem("easyShopeToken") || "",
  tenantSlug: localStorage.getItem("easyShopeTenantSlug") || "",
  role: localStorage.getItem("easyShopeRole") || "",
  customerToken: localStorage.getItem("easyShopeCustomerToken") || "",
  cart: [],
  storefrontCategory: "",
  merchantCategories: [],
  merchantProducts: [],
  merchantOrders: [],
  merchantAndroidBuilds: [],
  androidIntegration: null,
  storefrontThemeDraft: "ocean",
};

const STOREFRONT_THEME_LABELS = {
  ocean: "Ocean — أزياء كلاسيكية (شبكة + شريط سفلي)",
  violet: "Violet — تجميل (قصص + بطاقات)",
  emerald: "Emerald — إلكترونيات (قائمة + سلة)",
  amber: "Amber — مطعم (بانر + عروض)",
  rose: "Rose — منزل وديكور (معرض + شبكة)",
  slate: "Slate — إبداعي (minimal)",
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

function storefrontCategoryControlsHtml(categories, mode) {
  const active = state.storefrontCategory ?? "";
  const extra = mode === "tabs" ? "storefront-tab" : mode === "rail" ? "storefront-rail-btn" : "";
  const row = (slug, label, isOn) => {
    const cls = [isOn ? "active" : "", extra].filter(Boolean).join(" ").trim();
    return `<button type="button" class="${cls}" data-store-category="${slug}">${label}</button>`;
  };
  return [
    row("", "الكل", active === ""),
    ...categories.map((c) => row(c.slug, `${c.name_ar} (${c.products_count})`, active === c.slug)),
  ].join("");
}

function renderStorefrontChrome(layout, store, categories) {
  const bar = $("storefront-chrome-bar");
  const rail = $("storefront-category-rail");
  const bottom = $("storefront-bottom-nav");
  const pills = $("storefront-categories");
  if (!bar || !rail || !bottom || !pills) return;

  const name = store.name_ar || store.name_en || "المتجر";
  const catTabs = storefrontCategoryControlsHtml(categories, "tabs");
  const catRail = storefrontCategoryControlsHtml(categories, "rail");
  const catPills = storefrontCategoryControlsHtml(categories, "pills");

  bar.hidden = false;
  rail.hidden = layout !== "amber";
  bottom.hidden = layout !== "emerald";

  if (layout === "ocean") {
    bar.innerHTML = `<div class="storefront-chrome-inner storefront-chrome--ocean"><div class="storefront-chrome-brand"><span class="storefront-chrome-dot" aria-hidden="true"></span><div><strong>${name}</strong><small>أزياء وإكسسوارات · شبكة منتجات</small></div></div><div id="storefront-chrome-tabs" class="storefront-chrome-tabs">${catTabs}</div></div>`;
    rail.innerHTML = "";
    bottom.innerHTML = "";
    pills.innerHTML = "";
    pills.hidden = true;
  } else if (layout === "violet") {
    bar.innerHTML = `<div class="storefront-chrome-inner storefront-chrome--violet"><div class="storefront-chrome-brand"><div><strong>${name}</strong><small>تجميل وعناية · قصص وبطاقات</small></div></div><span class="storefront-chrome-pill">Beauty</span></div>`;
    rail.innerHTML = "";
    bottom.innerHTML = "";
    pills.innerHTML = catPills;
    pills.hidden = false;
  } else if (layout === "emerald") {
    bar.innerHTML = `<div class="storefront-chrome-inner storefront-chrome--emerald"><div class="storefront-chrome-brand"><div><strong>${name}</strong><small>إلكترونيات وتقنية</small></div></div><span class="storefront-chrome-chip">Tech hub</span></div>`;
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
    bar.innerHTML = `<div class="storefront-chrome-inner storefront-chrome--amber"><div class="storefront-chrome-brand"><div><strong>${name}</strong><small>مطعم ومأكولات · قائمة يومية</small></div></div><span class="storefront-delivery-badge">توصيل متاح</span></div>`;
    rail.innerHTML = `<div class="storefront-rail-inner"><div class="storefront-rail-title">القائمة</div><div class="storefront-rail-list">${catRail}</div></div>`;
    bottom.innerHTML = "";
    pills.innerHTML = "";
    pills.hidden = true;
  } else if (layout === "rose") {
    bar.innerHTML = `<div class="storefront-chrome-inner storefront-chrome--rose"><div class="storefront-chrome-brand"><div><strong>${name}</strong><small>منزل وديكور · معرض صور</small></div></div></div>`;
    rail.innerHTML = "";
    bottom.innerHTML = "";
    pills.innerHTML = catPills;
    pills.hidden = false;
  } else if (layout === "slate") {
    bar.innerHTML = `<div class="storefront-chrome--slate-wrap"><div class="storefront-chrome-art" aria-hidden="true"></div><div class="storefront-chrome-inner storefront-chrome--slate"><div class="storefront-chrome-brand"><div><strong>${name}</strong><small>إبداعي · قائمة بسيطة</small></div></div></div></div>`;
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
    <button type="button" class="success-button" data-add-cart="${item.id}" data-title="${title}" data-price="${item.price_cents}">${addLabel}</button>
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
  if (!el) return;
  el.textContent = message;
  const isError = kind === true || kind === "error";
  const isWarn = kind === "warn";
  el.className = isError ? "message error" : isWarn ? "message warn" : "message ok";
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
    if (button.dataset.merchantTab !== tab) {
      button.classList.remove("active");
      return;
    }
    button.classList.add("active");
  });
  document.querySelectorAll(".merchant-side-item").forEach((button) => {
    if (!button.dataset.merchantTab) return;
    if (button.dataset.merchantTab !== tab) {
      button.classList.remove("active");
      return;
    }
    button.classList.add("active");
  });
  document.querySelectorAll("[data-merchant-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.merchantPanel === tab);
  });
  if (tab === "billing") loadPlans().then(loadBillingData).catch((error) => showMessage(error.message, true));
  if (tab === "android") void loadAndroidBuildsOnly();
  if (tab !== "categories") setCreationForm("category-form", false);
  if (tab !== "products") setCreationForm("product-form", false);
}

function setView(view, options = {}) {
  updateNavigation();
  if (!$(`view-${view}`)) view = defaultViewForScope();
  document.body.dataset.view = view;
  document.querySelectorAll(".view").forEach((element) => element.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((element) => element.classList.remove("active"));
  $(`view-${view}`)?.classList.add("active");
  document.querySelector(`.nav-item[data-view="${view}"]:not([hidden])`)?.classList.add("active");
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
    setCreationForm("category-form", false);
    setMerchantTab("categories");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "إضافة تصنيف";
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
    const uploadedVideo = "";
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
    showMessage("جارٍ حفظ المنتج...");
    await api("/api/merchant/products", { method: "POST", body: JSON.stringify(payload), timeoutMs: 25000 });
    showMessage("تم إنشاء المنتج.");
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
  if ($("store-brand-color")) $("store-brand-color").value = store.brand_color || "";
  if ($("checkout-provider")) $("checkout-provider").value = store.checkout_provider || "paymob";
  state.storefrontThemeDraft = store.storefront_theme || "ocean";
  updateThemePickerUi();
  const url = `${window.location.origin}/#store/${store.slug || state.tenantSlug || ""}`;
  if ($("storefront-url")) $("storefront-url").textContent = url;
}

function updateThemePickerUi() {
  document.querySelectorAll("[data-storefront-theme]").forEach((button) => {
    button.classList.toggle("active", button.dataset.storefrontTheme === state.storefrontThemeDraft);
  });
  if ($("theme-selected")) $("theme-selected").textContent = `القالب الحالي: ${STOREFRONT_THEME_LABELS[state.storefrontThemeDraft] || state.storefrontThemeDraft}`;
}

function initThemeLibraryFilters() {
  const chipRoot = document.getElementById("theme-filter-chips");
  const grid = document.getElementById("theme-grid");
  if (!chipRoot || !grid) return;
  const tiles = grid.querySelectorAll("[data-storefront-theme][data-theme-tags]");
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
  showMessage("تم حفظ تمبلت واجهة المتجر.");
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
              <span class="status-badge ${item.is_enabled ? "ok" : "off"}">${item.is_enabled ? "Active" : "Inactive"}</span>
            </div>
            <small>${item.mode}${item.provider === "paymob" ? ` • Card integration: ${item.public_config.cardIntegrationId || "-"}` : ""}</small>
          </li>`,
        )
        .join("") || "<li>لم يتم ربط دفع بعد.</li>";
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
  const latestOrders = dashboard.latestOrders || [];
  const latestMarkup =
    latestOrders.map((order) => `<li><strong>${order.customer_name}</strong><span>${money(order.total_cents)} - ${order.status}</span></li>`).join("") ||
    "<li>لا توجد طلبات حديثة.</li>";
  if ($("merchant-latest-orders")) $("merchant-latest-orders").innerHTML = latestMarkup;

  renderOverviewAlerts(dashboard, billingInvoices);
  $("product-category").innerHTML =
    `<option value="">بدون تصنيف</option>` + state.merchantCategories.map((item) => `<option value="${item.id}">${item.name_ar}</option>`).join("");
  $("product-filter-category").innerHTML =
    `<option value="">كل الأصناف</option>` + state.merchantCategories.map((item) => `<option value="${item.id}">${item.name_ar}</option>`).join("");
  renderMerchantCategories();
  renderMerchantProducts();
  renderMerchantOrders();
  await loadAndroidBuildsOnly();
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
  if (btn && state.role === "merchant_owner") {
    btn.disabled = !ready;
    btn.title = ready ? "" : "أكمل ضبط متغيرات الخادم أولًا (انظر الصندوق أعلاه).";
  }
}

function renderMerchantAndroidBuilds() {
  const ul = $("merchant-android-builds");
  const btn = $("merchant-android-build-request");
  if (btn) btn.hidden = state.role !== "merchant_owner";
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
      const download = row.artifact_url
        ? `<a href="${row.artifact_url}" target="_blank" rel="noopener noreferrer">تحميل APK</a>`
        : "";
      const run = row.github_run_url ? `<a href="${row.github_run_url}" target="_blank" rel="noopener noreferrer">سجل GitHub</a>` : "";
      const meta = [download, run].filter(Boolean).join(" · ");
      const err = row.error_message ? `<div class="muted"><small>${escapeHtmlText(row.error_message)}</small></div>` : "";
      return `<li><div class="provider-line"><strong>${formatAndroidBuildStatus(row.status)}</strong><span>${when}</span></div>${meta ? `<div>${meta}</div>` : ""}${err}</li>`;
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
  try {
    if (btn) btn.disabled = true;
    await api("/api/merchant/android-build", { method: "POST", body: JSON.stringify({}) });
    showMessage("تم طلب بناء التطبيق. راقب القائمة أدناه حتى يكتمل المسار.");
    await loadAndroidBuildsOnly();
  } catch (error) {
    if (error.statusCode === 503 && error.code === "android_build_not_configured") {
      showMessage("ضبط الخادم لا يزال ناقصًا — راجع المربع التحذيري أعلى الصفحة أو تواصل مع مسؤول المنصة.", "warn");
      await loadAndroidBuildsOnly();
    } else {
      showMessage(error.message, true);
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
    alerts.push(
      "أنت في وضع التجربة — الواجهة تعمل بشكل طبيعي. ابدأ بإضافة أصناف ومنتجات، ثم ادفع اشتراك المنصة من «اشتراك المنصة» عند الجاهزية.",
    );
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
        const statusBadge = `<span class="status-badge">${order.status}</span>`;
        const payBadge = `<span class="status-badge ${order.payment_status === "paid" ? "ok" : "off"}">${order.payment_status || "-"}</span>`;
        return `<tr>
          <td><strong>${order.customer_name || "-"}</strong><br><small>${order.id}</small></td>
          <td>${money(order.total_cents)}</td>
          <td>${payBadge}</td>
          <td>${statusBadge}</td>
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
      .join("") || `<tr><td colspan="6">لا توجد طلبات مطابقة.</td></tr>`;

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
        </tr>`;
      })
      .join("") || `<tr><td colspan="3">لا توجد تصنيفات مطابقة.</td></tr>`;
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
        const statusBadge = `<span class="status-badge ${item.status === "published" ? "ok" : "off"}">${item.status}</span>`;
        return `<tr>
          <td><input type="checkbox" class="product-select" data-product-select="${item.id}"></td>
          <td><strong>${item.image_url ? `<img class="list-thumb" src="${item.image_url}" alt="">` : ""}${item.title_ar}<br><small>${item.title_en || ""}</small></strong></td>
          <td>${money(item.price_cents)}${item.discount_percent ? ` <small class="discount-badge">خصم ${item.discount_percent}%</small>` : ""}</td>
          <td><small>${item.stock_quantity}</small></td>
          <td><small>${categoryName}</small></td>
          <td>${statusBadge}</td>
          <td>
            <div class="row-actions">
              <button class="mini-button" data-product-status="${item.id}:${item.status === "published" ? "draft" : "published"}">${item.status === "published" ? "إخفاء" : "نشر"}</button>
              <button class="mini-button danger-button" data-product-delete="${item.id}">حذف</button>
            </div>
          </td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="7">لا توجد منتجات مطابقة.</td></tr>`;

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
  const filter = ($("staff-filter")?.value || "").trim().toLowerCase();
  const rows = (data.staff || []).filter((m) => {
    if (!filter) return true;
    return `${m.name} ${m.email}`.toLowerCase().includes(filter);
  });
  staffList.innerHTML =
    rows
      .map(
        (member) => `<li>
          <div class="provider-line">
            <strong>${member.name}<br><small>${member.email}${member.phone ? ` • ${member.phone}` : ""}</small></strong>
            <span class="status-badge ${member.status === "active" ? "ok" : "off"}">${member.status}</span>
          </div>
          <span class="row-actions">
            <button class="mini-button" data-staff-status="${member.id}:${member.status === "active" ? "disabled" : "active"}">${member.status === "active" ? "تعطيل" : "تفعيل"}</button>
            <button class="mini-button danger-button" data-staff-delete="${member.id}">حذف</button>
          </span>
        </li>`,
      )
      .join("") || "<li>لا يوجد موظفون مطابقون.</li>";
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
      const dialog = $("order-dialog");
      const title = $("order-dialog-title");
      const body = $("order-dialog-body");
      if (!dialog || !title || !body) return;
      title.textContent = `طلب ${data.order.id}`;
      body.innerHTML = `
        <div class="dialog-grid">
          <div class="hint-box"><strong>العميل</strong><p>${data.order.customer_name || "-"}</p><small>${data.order.customer_phone || ""}</small></div>
          <div class="hint-box"><strong>الإجمالي</strong><p>${money(data.order.total_cents)}</p><small>الدفع: ${data.order.payment_status || "-"}</small></div>
        </div>
        <div class="hint-box"><strong>العناصر</strong><p>${data.items
          .map((item) => `${item.title} × ${item.quantity} = ${money(item.total_cents)}`)
          .join("<br>")}</p></div>
      `;
      dialog.showModal();
    });
  });
}

async function loadStorefront(event) {
  event?.preventDefault();
  const slug = $("tenant-slug").value.trim();
  if (!slug) {
    $("storefront-products").innerHTML = "<p>بعد تسجيل التاجر سيظهر slug المتجر هنا تلقائيًا.</p>";
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
  const theme = store.store.storefront_theme || "ocean";
  const layout = normalizeStorefrontLayout(theme);
  document.body.dataset.theme = theme;
  const shell = $("storefront-shell");
  if (shell) shell.dataset.storefrontLayout = layout;
  renderStorefrontChrome(layout, store.store, store.categories);
  const data = await api(`/api/store/${slug}/products${queryString({ q: $("storefront-query").value.trim(), category: state.storefrontCategory })}`);
  $("storefront-title").textContent = store.store.name_ar || store.store.name_en;
  $("storefront-subtitle").textContent = `${store.store.name_en} - ${store.store.country} - ${store.store.status}`;
  renderStorefrontStories(store.categories, layout);
  renderStorefrontSpotlight(store.store, data.products, layout);
  $("storefront-products").innerHTML =
    data.products.map((item) => storefrontProductHtml(item, layout)).join("") || "<p>لا توجد منتجات منشورة في هذا المتجر.</p>";
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

function initStorefrontDelegation() {
  const shell = $("storefront-shell");
  if (!shell || shell.dataset.delegationBound === "1") return;
  shell.dataset.delegationBound = "1";
  shell.addEventListener("click", async (e) => {
    const navBtn = e.target.closest("#storefront-bottom-nav [data-store-nav]");
    if (navBtn) {
      e.preventDefault();
      const id = navBtn.dataset.storeNav;
      if (id === "cart") $("storefront-cart-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (id === "cats") $("storefront-categories")?.scrollIntoView({ behavior: "smooth", block: "center" });
      else if (id === "account") {
        const det = document.querySelector("#storefront-cart-panel .customer-account");
        if (det && !det.open) det.open = true;
        document.querySelector("#customer-register-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else $("storefront-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelectorAll("#storefront-bottom-nav [data-store-nav]").forEach((b) => b.classList.toggle("is-active", b === navBtn));
      return;
    }
    const categoryBtn = e.target.closest(
      "#storefront-categories [data-store-category], #storefront-stories [data-store-category], #storefront-chrome-tabs [data-store-category], #storefront-category-rail [data-store-category]",
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
    $("product-detail").innerHTML = `${productMediaHtml(data.product)}<strong>${data.product.title_ar}</strong><p>${data.product.description || "لا يوجد وصف."}</p><div class="price-stack">${productPriceHtml(data.product)}</div><p>${data.product.stock_quantity} في المخزون</p>${
      variants.length
        ? `<div class="variant-pills">${variants
            .map((variant) => `<span>${variant.type || "نوع"} ${variant.color || ""}${variant.extraPriceCents ? ` + ${money(variant.extraPriceCents)}` : ""}${variant.stockQuantity !== null && variant.stockQuantity !== undefined ? ` - مخزون ${variant.stockQuantity}` : ""}</span>`)
            .join("")}</div>`
        : ""
    }`;
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
  const expiry = store.subscription_expires_at ? new Date(store.subscription_expires_at) : null;
  const daysLeft = expiry ? Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const expiryText = expiry ? expiry.toLocaleDateString("ar-EG") : "غير محدد";
  const expiryBadge =
    daysLeft === null
      ? ""
      : daysLeft < 0
        ? `<span class="status-badge off">منتهي</span>`
        : daysLeft <= 7
          ? `<span class="status-badge off">ينتهي خلال ${daysLeft} يوم</span>`
          : `<span class="status-badge ok">متبقي ${daysLeft} يوم</span>`;
  $("subscription-status").innerHTML = `<div class="provider-line"><strong>${activeText}</strong>${expiryBadge}</div><p>الخطة: ${store.plan_code} - ينتهي: ${expiryText}</p>`;
  const paid = (invoices || []).filter((invoice) => invoice.status === "paid");
  const open = (invoices || []).filter((invoice) => invoice.status !== "paid");

  $("subscription-invoices-paid").innerHTML =
    paid
      .map(
        (invoice) =>
          `<li><strong>${invoice.plan_name || invoice.plan_code} - ${money(invoice.amount_cents)}<small>${invoice.provider || ""} ${invoice.provider_reference || ""}</small></strong><span class="status-badge ok">Paid</span></li>`,
      )
      .join("") || "<li>لا توجد فواتير مدفوعة بعد.</li>";

  $("subscription-invoices-open").innerHTML =
    open
      .map(
        (invoice) => `<li><strong>${invoice.plan_name || invoice.plan_code} - ${money(invoice.amount_cents)}<small>${invoice.provider || ""} ${invoice.provider_reference || ""}</small></strong><span>${invoice.status} ${
          `<button class="mini-button" data-pay-invoice="${invoice.id}">دفع Paymob</button>`
        }</span></li>`,
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
  initThemeLibraryFilters();
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
      setMerchantTab(button.dataset.merchantJump);
    });
  });
  document.querySelectorAll("[data-merchant-tab]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setMerchantTab(button.dataset.merchantTab);
    });
  });
  // Billing lives inside merchant dashboard; no standalone payments view handlers.
  $("category-filter").addEventListener("input", renderMerchantCategories);
  $("show-category-form").addEventListener("click", () => setCreationForm("category-form", true));
  $("cancel-category-form").addEventListener("click", () => setCreationForm("category-form", false));
  $("product-filter").addEventListener("input", renderMerchantProducts);
  $("product-filter-category").addEventListener("change", renderMerchantProducts);
  $("product-filter-status").addEventListener("change", renderMerchantProducts);
  $("show-product-form").addEventListener("click", () => setCreationForm("product-form", true));
  $("cancel-product-form").addEventListener("click", () => setCreationForm("product-form", false));
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
  $("staff-form").addEventListener("submit", createStaff);
  $("password-form").addEventListener("submit", changePassword);
  $("easycash-form").addEventListener("submit", saveEasyCash);
  $("paymob-form").addEventListener("submit", savePaymob);
  $("test-paymob").addEventListener("click", testPaymob);
  $("platform-paymob-form").addEventListener("submit", savePlatformPaymob);
  $("test-platform-paymob").addEventListener("click", testPlatformPaymob);
  $("subscription-form").addEventListener("submit", createSubscriptionInvoice);
  $("storefront-form").addEventListener("submit", loadStorefront);
  initStorefrontDelegation();
  $("order-form").addEventListener("submit", placeOrder);
  $("customer-register-form").addEventListener("submit", registerCustomer);
  $("customer-orders-button").addEventListener("click", loadCustomerOrders);
  $("staff-filter")?.addEventListener("input", loadStaff);
  $("save-checkout-provider")?.addEventListener("click", saveCheckoutProvider);
  document.querySelectorAll("[data-storefront-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      state.storefrontThemeDraft = button.dataset.storefrontTheme;
      updateThemePickerUi();
    });
  });
  $("save-storefront-theme")?.addEventListener("click", saveStorefrontTheme);
  $("merchant-android-build-request")?.addEventListener("click", () => requestMerchantAndroidBuild());
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
  bootstrap().then(handlePaymentReturn);
});
