import nodemailer from "nodemailer";
import type pg from "pg";

const smtpHost = process.env.SMTP_HOST?.trim() ?? "";
const smtpPort = Number(process.env.SMTP_PORT ?? 587);
const smtpUser = process.env.SMTP_USER?.trim() ?? "";
const smtpPass = process.env.SMTP_PASS ?? "";
const smtpFrom = process.env.SMTP_FROM?.trim() || "Easy Shope <noreply@easyshope.local>";
const notifyEnabled = (process.env.NOTIFY_EMAIL_ENABLED ?? "true").toLowerCase() !== "false";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!smtpHost) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    });
  }
  return transporter;
}

export function emailNotificationsConfigured() {
  return Boolean(smtpHost);
}

async function sendMail(opts: { to: string; subject: string; text: string; html: string }) {
  if (!notifyEnabled) return { sent: false, reason: "disabled" };
  const transport = getTransporter();
  if (!transport) return { sent: false, reason: "smtp_not_configured" };
  await transport.sendMail({ from: smtpFrom, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
  return { sent: true };
}

function formatMoney(cents: number) {
  return `${(cents / 100).toFixed(2)} EGP`;
}

export function buildWhatsAppUrl(phoneDigits: string, message: string) {
  const digits = phoneDigits.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("20") ? digits : digits.startsWith("0") ? `20${digits.slice(1)}` : `20${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function buildNewOrderWhatsAppMessage(opts: {
  storeName: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  totalCents: number;
  trackingUrl?: string | null;
}) {
  const lines = [
    `طلب جديد — ${opts.storeName}`,
    `رقم الطلب: ${opts.orderId}`,
    `العميل: ${opts.customerName}`,
    `الموبايل: ${opts.customerPhone}`,
    `الإجمالي: ${formatMoney(opts.totalCents)}`,
  ];
  if (opts.trackingUrl) lines.push(`متابعة: ${opts.trackingUrl}`);
  return lines.join("\n");
}

export async function notifyOrderStatusChange(
  pool: pg.Pool,
  opts: {
    tenantId: string;
    orderId: string;
    status: string;
    customerName: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    trackingNumber?: string | null;
    carrierCode?: string | null;
    trackingUrl?: string | null;
  },
) {
  const tenantRes = await pool.query(`SELECT name_ar, name_en, store_settings FROM tenants WHERE id = $1`, [opts.tenantId]);
  const tenant = tenantRes.rows[0] as { name_ar?: string; name_en?: string; store_settings?: unknown } | undefined;
  const storeName = tenant?.name_ar || tenant?.name_en || "المتجر";
  const settings = tenant?.store_settings as { notifyEmailOnStatusChange?: boolean } | undefined;
  if (settings?.notifyEmailOnStatusChange === false) return { sent: false, reason: "disabled" };

  const statusLabels: Record<string, string> = {
    confirmed: "تم تأكيد طلبك",
    processing: "طلبك قيد التجهيز",
    shipped: "تم شحن طلبك",
    delivered: "تم تسليم طلبك",
    cancelled: "تم إلغاء طلبك",
  };
  const subject = `${statusLabels[opts.status] || "تحديث على طلبك"} — ${storeName}`;
  const trackingLine = opts.trackingNumber
    ? `\nرقم الشحنة: ${opts.trackingNumber}${opts.trackingUrl ? `\nتتبع: ${opts.trackingUrl}` : ""}`
    : opts.trackingUrl
      ? `\nتتبع الطلب: ${opts.trackingUrl}`
      : "";

  const customerEmail = opts.customerEmail?.trim();
  if (!customerEmail) return { sent: false, reason: "no_customer_email" };

  return sendMail({
    to: customerEmail,
    subject,
    text: `مرحبًا ${opts.customerName},\n\n${subject}.\n\nرقم الطلب: ${opts.orderId}${trackingLine}\n\n— ${storeName}`,
    html: `<p>مرحبًا <strong>${opts.customerName}</strong>,</p>
<p><strong>${subject}.</strong></p>
<ul><li><strong>رقم الطلب:</strong> ${opts.orderId}</li>${opts.trackingNumber ? `<li><strong>رقم الشحنة:</strong> ${opts.trackingNumber}</li>` : ""}</ul>
${opts.trackingUrl ? `<p><a href="${opts.trackingUrl}">متابعة الطلب</a></p>` : ""}
<p>— ${storeName}</p>`,
  });
}

export async function notifyNewStoreOrder(
  pool: pg.Pool,
  opts: {
    tenantId: string;
    orderId: string;
    totalCents: number;
    customerName: string;
    customerPhone: string;
    customerEmail?: string | null;
    checkoutUrl?: string | null;
    trackingUrl?: string | null;
  },
) {
  const [tenantRes, ownerRes] = await Promise.all([
    pool.query(`SELECT name_ar, name_en, slug, store_settings FROM tenants WHERE id = $1`, [opts.tenantId]),
    pool.query(`SELECT email, name FROM users WHERE tenant_id = $1 AND role = 'merchant_owner' LIMIT 1`, [opts.tenantId]),
  ]);
  const tenant = tenantRes.rows[0] as { name_ar?: string; name_en?: string; slug?: string; store_settings?: unknown } | undefined;
  const owner = ownerRes.rows[0] as { email?: string; name?: string } | undefined;
  const storeName = tenant?.name_ar || tenant?.name_en || "متجرك";
  const merchantEmail = owner?.email?.trim();
  const payLine = opts.checkoutUrl ? `\nرابط الدفع للعميل: ${opts.checkoutUrl}` : "";
  const trackLine = opts.trackingUrl ? `\nرابط متابعة الطلب: ${opts.trackingUrl}` : "";
  const settings = tenant?.store_settings as { merchantWhatsAppPhone?: string; notifyWhatsAppOnNewOrder?: boolean } | undefined;
  const whatsappUrl =
    settings?.notifyWhatsAppOnNewOrder !== false && settings?.merchantWhatsAppPhone
      ? buildWhatsAppUrl(
          settings.merchantWhatsAppPhone,
          buildNewOrderWhatsAppMessage({
            storeName,
            orderId: opts.orderId,
            customerName: opts.customerName,
            customerPhone: opts.customerPhone,
            totalCents: opts.totalCents,
            trackingUrl: opts.trackingUrl,
          }),
        )
      : null;

  const results: { merchant?: unknown; customer?: unknown; whatsappUrl?: string | null } = { whatsappUrl };

  if (merchantEmail) {
    results.merchant = await sendMail({
      to: merchantEmail,
      subject: `طلب جديد — ${storeName}`,
      text: `مرحبًا ${owner?.name || ""},\n\nوصل طلب جديد لمتجرك «${storeName}».\n\nرقم الطلب: ${opts.orderId}\nالعميل: ${opts.customerName}\nالموبايل: ${opts.customerPhone}\nالإجمالي: ${formatMoney(opts.totalCents)}${payLine}${trackLine}\n\n— Easy Shope`,
      html: `<p>مرحبًا <strong>${owner?.name || ""}</strong>,</p>
<p>وصل طلب جديد لمتجرك <strong>${storeName}</strong>.</p>
<ul>
  <li><strong>رقم الطلب:</strong> ${opts.orderId}</li>
  <li><strong>العميل:</strong> ${opts.customerName}</li>
  <li><strong>الموبايل:</strong> ${opts.customerPhone}</li>
  <li><strong>الإجمالي:</strong> ${formatMoney(opts.totalCents)}</li>
</ul>
${opts.checkoutUrl ? `<p><a href="${opts.checkoutUrl}">رابط الدفع للعميل</a></p>` : ""}
${opts.trackingUrl ? `<p><a href="${opts.trackingUrl}">رابط متابعة الطلب</a></p>` : ""}
<p>— Easy Shope</p>`,
    });
  }

  const customerEmail = opts.customerEmail?.trim();
  if (customerEmail) {
    results.customer = await sendMail({
      to: customerEmail,
      subject: `تأكيد طلبك — ${storeName}`,
      text: `مرحبًا ${opts.customerName},\n\nتم استلام طلبك من متجر «${storeName}».\n\nرقم الطلب: ${opts.orderId}\nالإجمالي: ${formatMoney(opts.totalCents)}${payLine}${trackLine}\n\nشكرًا لتسوقك معنا.\n— ${storeName}`,
      html: `<p>مرحبًا <strong>${opts.customerName}</strong>,</p>
<p>تم استلام طلبك من متجر <strong>${storeName}</strong>.</p>
<ul>
  <li><strong>رقم الطلب:</strong> ${opts.orderId}</li>
  <li><strong>الإجمالي:</strong> ${formatMoney(opts.totalCents)}</li>
</ul>
${opts.checkoutUrl ? `<p><a href="${opts.checkoutUrl}">إتمام الدفع الآن</a></p>` : "<p>سيتواصل معك المتجر قريبًا لتأكيد الطلب.</p>"}
${opts.trackingUrl ? `<p><a href="${opts.trackingUrl}">متابعة الطلب</a></p>` : ""}
<p>شكرًا لتسوقك معنا.<br>— ${storeName}</p>`,
    });
  }

  return results;
}
