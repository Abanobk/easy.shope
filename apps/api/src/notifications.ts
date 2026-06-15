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
  },
) {
  const [tenantRes, ownerRes] = await Promise.all([
    pool.query(`SELECT name_ar, name_en, slug FROM tenants WHERE id = $1`, [opts.tenantId]),
    pool.query(`SELECT email, name FROM users WHERE tenant_id = $1 AND role = 'merchant_owner' LIMIT 1`, [opts.tenantId]),
  ]);
  const tenant = tenantRes.rows[0] as { name_ar?: string; name_en?: string; slug?: string } | undefined;
  const owner = ownerRes.rows[0] as { email?: string; name?: string } | undefined;
  const storeName = tenant?.name_ar || tenant?.name_en || "متجرك";
  const merchantEmail = owner?.email?.trim();
  const payLine = opts.checkoutUrl ? `\nرابط الدفع للعميل: ${opts.checkoutUrl}` : "";

  const results: { merchant?: unknown; customer?: unknown } = {};

  if (merchantEmail) {
    results.merchant = await sendMail({
      to: merchantEmail,
      subject: `طلب جديد — ${storeName}`,
      text: `مرحبًا ${owner?.name || ""},\n\nوصل طلب جديد لمتجرك «${storeName}».\n\nرقم الطلب: ${opts.orderId}\nالعميل: ${opts.customerName}\nالموبايل: ${opts.customerPhone}\nالإجمالي: ${formatMoney(opts.totalCents)}${payLine}\n\n— Easy Shope`,
      html: `<p>مرحبًا <strong>${owner?.name || ""}</strong>,</p>
<p>وصل طلب جديد لمتجرك <strong>${storeName}</strong>.</p>
<ul>
  <li><strong>رقم الطلب:</strong> ${opts.orderId}</li>
  <li><strong>العميل:</strong> ${opts.customerName}</li>
  <li><strong>الموبايل:</strong> ${opts.customerPhone}</li>
  <li><strong>الإجمالي:</strong> ${formatMoney(opts.totalCents)}</li>
</ul>
${opts.checkoutUrl ? `<p><a href="${opts.checkoutUrl}">رابط الدفع للعميل</a></p>` : ""}
<p>— Easy Shope</p>`,
    });
  }

  const customerEmail = opts.customerEmail?.trim();
  if (customerEmail) {
    results.customer = await sendMail({
      to: customerEmail,
      subject: `تأكيد طلبك — ${storeName}`,
      text: `مرحبًا ${opts.customerName},\n\nتم استلام طلبك من متجر «${storeName}».\n\nرقم الطلب: ${opts.orderId}\nالإجمالي: ${formatMoney(opts.totalCents)}${payLine}\n\nشكرًا لتسوقك معنا.\n— ${storeName}`,
      html: `<p>مرحبًا <strong>${opts.customerName}</strong>,</p>
<p>تم استلام طلبك من متجر <strong>${storeName}</strong>.</p>
<ul>
  <li><strong>رقم الطلب:</strong> ${opts.orderId}</li>
  <li><strong>الإجمالي:</strong> ${formatMoney(opts.totalCents)}</li>
</ul>
${opts.checkoutUrl ? `<p><a href="${opts.checkoutUrl}">إتمام الدفع الآن</a></p>` : "<p>سيتواصل معك المتجر قريبًا لتأكيد الطلب.</p>"}
<p>شكرًا لتسوقك معنا.<br>— ${storeName}</p>`,
    });
  }

  return results;
}
