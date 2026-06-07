# Easy Shope Mobile (Native White-Label)

تطبيق Flutter **أصلي** — كل قالب storefront له **كود UI منفصل**، وGitHub Actions يبني APK بالقالب المحفوظ للتاجر.

## القوالب (compile-time)

| `STOREFRONT_THEME` | الملف | التخطيط |
|---|---|---|
| `ocean` | `lib/templates/ocean/` | شبكة + شريط سفلي |
| `violet` | `lib/templates/violet/` | Stories + بطاقات |
| `emerald` | `lib/templates/emerald/` | قائمة + شريط سفلي |
| `amber` | `lib/templates/amber/` | Rail أقسام + بانر |
| `rose` | `lib/templates/rose/` | Carousel + شبكة |
| `slate` | `lib/templates/slate/` | Minimal list |

## dart-define (من CI)

- `TENANT_SLUG` — slug المتجر (مثلاً `easy`)
- `STOREFRONT_THEME` — أحد القوالب الستة
- `STOREFRONT_BASE_URL` — قاعدة الـ API (مثل `https://shope.easytecheg.net`)

## بناء محلي

```bash
cd apps/easy_shope_mobile
TENANT_SLUG=easy STOREFRONT_THEME=violet STORE_BASE=https://shope.easytecheg.net bash scripts/build-tenant-apk.sh
```

## GitHub Actions

Workflow: `.github/workflows/build-tenant-apk.yml`  
الـ API يمرّر `storefront_theme` من قاعدة البيانات عند طلب البناء من لوحة التاجر.
