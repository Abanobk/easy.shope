export type PaymentMethodsConfig = {
  paymob: boolean;
  cod: boolean;
  fawry: boolean;
};

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
    paymentMethods: { paymob: true, cod: true, fawry: false },
    codFeeCents: 0,
    freeShippingMinCents: 0,
    shippingRates: DEFAULT_EGYPT_SHIPPING_RATES.map((r) => ({ ...r })),
    metaPixelId: "",
    gtmId: "",
  };
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
  return {
    paymentMethods: {
      paymob: pm.paymob !== false,
      cod: pm.cod !== false,
      fawry: Boolean(pm.fawry),
    },
    codFeeCents: Math.max(0, Math.round(Number(o.codFeeCents) || 0)),
    freeShippingMinCents: Math.max(0, Math.round(Number(o.freeShippingMinCents) || 0)),
    shippingRates: rates.length ? rates : base.shippingRates,
    metaPixelId: String(o.metaPixelId || "").trim(),
    gtmId: String(o.gtmId || "").trim(),
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
  };
}

export function shippingFeeForGovernorate(settings: StoreSettings, governorateId: string | null | undefined, subtotalCents: number): number {
  if (settings.freeShippingMinCents > 0 && subtotalCents >= settings.freeShippingMinCents) return 0;
  const id = String(governorateId || "").trim().toLowerCase();
  const rate = settings.shippingRates.find((r) => r.id.toLowerCase() === id);
  return rate?.feeCents ?? settings.shippingRates.find((r) => r.id === "other")?.feeCents ?? 6500;
}
