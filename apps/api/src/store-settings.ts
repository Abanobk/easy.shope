export type PaymentMethodsConfig = {
  paymob: boolean;
  cod: boolean;
  fawry: boolean;
  easycash: boolean;
};

export type CarrierCode = "manual" | "bosta" | "aramex";

export type ShippingRate = {
  id: string;
  nameAr: string;
  nameEn: string;
  feeCents: number;
};

export type StoreSettings = {
  paymentMethods: PaymentMethodsConfig;
  codFeeCents: number;
  freeShippingMinCents: number;
  shippingRates: ShippingRate[];
  metaPixelId: string;
  gtmId: string;
  customDomain: string;
  merchantWhatsAppPhone: string;
  notifyWhatsAppOnNewOrder: boolean;
  notifyEmailOnStatusChange: boolean;
  defaultCarrier: CarrierCode;
  reviewsEnabled: boolean;
};

export const DEFAULT_EGYPT_SHIPPING_RATES: ShippingRate[] = [
  { id: "cairo", nameAr: "القاهرة", nameEn: "Cairo", feeCents: 3500 },
  { id: "giza", nameAr: "الجيزة", nameEn: "Giza", feeCents: 3500 },
  { id: "alexandria", nameAr: "الإسكندرية", nameEn: "Alexandria", feeCents: 4500 },
  { id: "qalyubia", nameAr: "القليوبية", nameEn: "Qalyubia", feeCents: 4000 },
  { id: "sharqia", nameAr: "الشرقية", nameEn: "Sharqia", feeCents: 5000 },
  { id: "gharbia", nameAr: "الغربية", nameEn: "Gharbia", feeCents: 5000 },
  { id: "dakahlia", nameAr: "الدقهلية", nameEn: "Dakahlia", feeCents: 5000 },
  { id: "beheira", nameAr: "البحيرة", nameEn: "Beheira", feeCents: 5500 },
  { id: "monufia", nameAr: "المنوفية", nameEn: "Monufia", feeCents: 5000 },
  { id: "other", nameAr: "محافظات أخرى", nameEn: "Other governorates", feeCents: 6500 },
];

export function defaultStoreSettings(): StoreSettings {
  return {
    paymentMethods: { paymob: true, cod: true, fawry: false, easycash: false },
    codFeeCents: 0,
    freeShippingMinCents: 0,
    shippingRates: DEFAULT_EGYPT_SHIPPING_RATES.map((r) => ({ ...r })),
    metaPixelId: "",
    gtmId: "",
    customDomain: "",
    merchantWhatsAppPhone: "",
    notifyWhatsAppOnNewOrder: true,
    notifyEmailOnStatusChange: true,
    defaultCarrier: "manual",
    reviewsEnabled: true,
  };
}

export function carrierTrackingUrl(carrierCode: string | null | undefined, trackingNumber: string | null | undefined): string | null {
  const num = String(trackingNumber || "").trim();
  if (!num) return null;
  const carrier = String(carrierCode || "manual").toLowerCase();
  if (carrier === "bosta") return `https://bosta.co/tracking-shipments?shipmentNumber=${encodeURIComponent(num)}`;
  if (carrier === "aramex") return `https://www.aramex.com/track/results?ShipmentNumber=${encodeURIComponent(num)}`;
  return null;
}

export function parseStoreSettings(raw: unknown): StoreSettings {
  const base = defaultStoreSettings();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const pm = (o.paymentMethods && typeof o.paymentMethods === "object" ? o.paymentMethods : {}) as Record<string, unknown>;
  const rates = Array.isArray(o.shippingRates)
    ? o.shippingRates
        .filter((r) => r && typeof r === "object")
        .map((r) => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row.id || "").trim(),
            nameAr: String(row.nameAr || "").trim(),
            nameEn: String(row.nameEn || "").trim(),
            feeCents: Math.max(0, Math.round(Number(row.feeCents) || 0)),
          };
        })
        .filter((r) => r.id && r.nameAr)
    : base.shippingRates;
  const defaultCarrierRaw = String(o.defaultCarrier || base.defaultCarrier).toLowerCase();
  const defaultCarrier: CarrierCode = defaultCarrierRaw === "bosta" || defaultCarrierRaw === "aramex" ? defaultCarrierRaw : "manual";
  return {
    paymentMethods: {
      paymob: pm.paymob !== false,
      cod: pm.cod !== false,
      fawry: Boolean(pm.fawry),
      easycash: Boolean(pm.easycash),
    },
    codFeeCents: Math.max(0, Math.round(Number(o.codFeeCents) || 0)),
    freeShippingMinCents: Math.max(0, Math.round(Number(o.freeShippingMinCents) || 0)),
    shippingRates: rates.length ? rates : base.shippingRates,
    metaPixelId: String(o.metaPixelId || "").trim(),
    gtmId: String(o.gtmId || "").trim(),
    customDomain: String(o.customDomain || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, ""),
    merchantWhatsAppPhone: String(o.merchantWhatsAppPhone || "").trim().replace(/\D/g, ""),
    notifyWhatsAppOnNewOrder: o.notifyWhatsAppOnNewOrder !== false,
    notifyEmailOnStatusChange: o.notifyEmailOnStatusChange !== false,
    defaultCarrier,
    reviewsEnabled: o.reviewsEnabled !== false,
  };
}

export function publicCheckoutConfig(settings: StoreSettings) {
  return {
    paymentMethods: settings.paymentMethods,
    codFeeCents: settings.codFeeCents,
    freeShippingMinCents: settings.freeShippingMinCents,
    shippingRates: settings.shippingRates.map((r) => ({
      id: r.id,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      feeCents: r.feeCents,
    })),
    metaPixelId: settings.metaPixelId || null,
    gtmId: settings.gtmId || null,
    reviewsEnabled: settings.reviewsEnabled,
    customDomain: settings.customDomain || null,
  };
}

export function shippingFeeForGovernorate(settings: StoreSettings, governorateId: string | null | undefined, subtotalCents: number): number {
  if (settings.freeShippingMinCents > 0 && subtotalCents >= settings.freeShippingMinCents) return 0;
  const id = String(governorateId || "").trim().toLowerCase();
  const rate = settings.shippingRates.find((r) => r.id.toLowerCase() === id);
  return rate?.feeCents ?? settings.shippingRates.find((r) => r.id === "other")?.feeCents ?? 6500;
}
