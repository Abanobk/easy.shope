# easy.shope

منصة متاجر متعددة المستأجرين (مشابهة لفكرة Shopify) — Flutter + backend لاحقًا.

## المرحلة 0 — النشر الآلي (مكتمل)

الهدف: التأكد أن **GitHub Actions** يتصل بـ TrueNAS عبر **SSH** ويكتب ملف نشر على السيرفر.

**لماذا Tailscale؟** عدّاء GitHub على الإنترنت **لا يصلون** عادةً إلى عنوان Tailscale (`100.x`) ولا ي reliably يصلون إلى **Cloudflare TCP SSH** (`ssh-deploy…`) — غالبًا **Operation timed out**. الحل: الخطوة **Connect Tailscale** في الـ workflow تضيف العدّاء إلى شبكتك، ثم **`SSH_HOST`** = عنوان **TrueNAS على Tailscale** (مثل `100.92.194.111`).

### 1) أسرار GitHub

في المستودع: **Settings → Secrets and variables → Actions** أضف:

| Secret | الوصف |
|--------|--------|
| `TAILSCALE_AUTHKEY` | مفتاح **Reusable / Ephemeral** من [Tailscale admin → Keys](https://login.tailscale.com/admin/settings/keys) (صلاحيات تسمح للأجهزة الجديدة بالوصول للـ NAS حسب ACL عندك) |
| `SSH_PRIVATE_KEY` | المفتاح الخاص كاملًا (`-----BEGIN OPENSSH PRIVATE KEY-----` … `END`) من `cat ~/.ssh/github_deploy_easyshope` — لصق من Terminal؛ لو ظهر `error in libcrypto` أعد اللصق أو احذف أي `\r` (لا تلصق ملف `.pub` هنا) |
| `SSH_USER` | اسم المستخدم على TrueNAS (مثل `root`) |
| `SSH_HOST` | **عنوان Tailscale للـ NAS** (مثل `100.92.194.111` — من `ip -4 addr show tailscale0` على TrueNAS) |
| `DEPLOY_PATH` | مسار مجلد على السيرفر (مثل `/root/easy-shope`) |

اختياري لتحسين أمان التحقق من المضيف:

| Secret | الوصف |
|--------|--------|
| `SSH_KNOWN_HOSTS` | مخرجات `ssh-keyscan -H 100.92.194.111` من جهاز بعد Tailscale (أو بعد أول run ناجح) |

### 2) على TrueNAS

- خدمة **SSH** مفعّلة على المنفذ **22**.
- **المفتاح العام** لمفتاح GitHub مضاف إلى `~/.ssh/authorized_keys` لمستخدم النشر.
- المجلد في `DEPLOY_PATH` قابل للكتابة من ذلك المستخدم.

### 3) الربط المحلي بـ GitHub

```bash
cd "/path/to/easy shope"
git init
git add .
git commit -m "chore: phase 0 — CI deploy skeleton"
git branch -M main
git remote add origin https://github.com/Abanobk/easy.shope.git
git push -u origin main
```

بعد أول `push` إلى `main`، راقب تبويب **Actions** في GitHub. عند نجاح المرحلة 0 ظهر على السيرفر الملف:

`$DEPLOY_PATH/phase0_last_deploy.txt`

## المرحلة 1 — تطبيق تجريبي على TrueNAS

الهدف: نشر خدمة فعلية على TrueNAS بدل ملف marker فقط.

- `docker-compose.yml` يشغل Nginx على المنفذ المحلي `8098`.
- `deploy/site/index.html` صفحة اختبار.
- `/health` يرجع `ok`.
- Cloudflare route المطلوب: `shope.easytecheg.net` → `http://192.168.1.53:8098`.
  - ملاحظة: الحاوية الداخلية Nginx تعمل HTTP على `8098`، وCloudflare يوفر HTTPS للزائر خارجيًا.

بعد نجاح الـ workflow، تحقق من السيرفر:

```bash
cat /root/easy-shope/phase1_last_deploy.txt
curl -fsS http://127.0.0.1:8098/health
```

ثم افتح:

```text
https://shope.easytecheg.net
```

## المرحلة 2 — أساس المنتج الحقيقي

الـ stack الحالي أصبح:

- `web`: Nginx على `8098` يقدم الواجهة ويعمل proxy إلى `/api`.
- `api`: Fastify/TypeScript على `3000`.
- `postgres`: قاعدة البيانات الأساسية.
- `redis`: جاهز للمهام والجلسات لاحقًا.

Endpoints مبدئية:

- `GET /api/health`
- `POST /api/auth/register-merchant`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/plans`
- `POST /api/merchant/categories`
- `GET /api/merchant/categories`
- `POST /api/merchant/products`
- `GET /api/merchant/products`
- `GET /api/store/:tenantSlug/products`
- `POST /api/store/:tenantSlug/orders`
- `POST /api/merchant/payment-providers/easycash`
- `POST /api/merchant/subscription-invoices`
- `GET /api/admin/overview`
- `GET /api/admin/tenants`
- `PATCH /api/admin/tenants/:tenantId/status`

سوبر أدمن افتراضي يتولد عند تشغيل الـ API من `.env` على السيرفر:

```text
PLATFORM_OWNER_EMAIL=owner@easyshope.local
PLATFORM_OWNER_PASSWORD=ChangeMe123!
```

غيّر هذه القيم في `/root/easy-shope/.env` قبل الاعتماد عليها في الإنتاج.

### البنية الحالية

- `.github/workflows/deploy.yml` — نشر عبر Tailscale + SSH بعد كل دفع على `main` (ويمكن تشغيله يدويًا من **Run workflow**).
- `docker-compose.yml` — خدمة Nginx التجريبية على `8098`.
- `apps/api/` — Backend API.
- `deploy/site/` — ملفات الصفحة الثابتة.
- `deploy/nginx/conf.d/` — إعداد Nginx.

## الدومين والنفق (مرجع)

- Cloudflare Tunnel `marichia` → `192.168.1.53`
- متجر الاختبار الحالي (الاسم المصحح): `shope.easytecheg.net` → `http://192.168.1.53:8098`
- الدومين القديم به خطأ إملائي ويُترك مؤقتًا فقط إن احتجت توافقًا: `esyhope.easytecheg.net` → `https://192.168.1.53:8099`
- SSH للنشر: `ssh-deploy.easytecheg.net` → `tcp://192.168.1.53:22`

لا ترفع مفاتيح أو `.env` إلى هذا المستودع العام.
