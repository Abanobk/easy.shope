# easy.shope

منصة متاجر متعددة المستأجرين (مشابهة لفكرة Shopify) — Flutter + backend لاحقًا.

## المرحلة 0 — النشر الآلي (مكتمل الهيكل)

الهدف: التأكد أن **GitHub Actions** يتصل بـ TrueNAS عبر **SSH** (عبر `ssh-deploy.easytecheg.net`) ويكتب ملف نشر على السيرفر.

### 1) أسرار GitHub

في المستودع: **Settings → Secrets and variables → Actions** أضف:

| Secret | الوصف |
|--------|--------|
| `SSH_PRIVATE_KEY` | المفتاح الخاص كاملًا (PEM) لمستخدم النشر |
| `SSH_USER` | اسم المستخدم على TrueNAS (مثل `deploy` أو `root`) |
| `SSH_HOST` | `ssh-deploy.easytecheg.net` |
| `DEPLOY_PATH` | مسار مجلد على السيرفر (مثل `/home/deploy/easy-shope` أو مسار dataset) |

اختياري لتحسين أمان التحقق من المضيف:

| Secret | الوصف |
|--------|--------|
| `SSH_KNOWN_HOSTS` | مخرجات `ssh-keyscan ssh-deploy.easytecheg.net` (سطر أو أكثر) |

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

بعد أول `push` إلى `main`، راقب تبويب **Actions** في GitHub. عند النجاح يظهر على السيرفر الملف:

`$DEPLOY_PATH/phase0_last_deploy.txt`

### البنية الحالية

- `.github/workflows/deploy.yml` — نشر عبر SSH بعد كل دفع على `main` (ويمكن تشغيله يدويًا من **Run workflow**).

## الدومين والنفق (مرجع)

- Cloudflare Tunnel `marichia` → `192.168.1.53`
- متجر الاختبار الحالي: `esyhope.easytecheg.net` → `https://192.168.1.53:8099`
- SSH للنشر: `ssh-deploy.easytecheg.net` → `tcp://192.168.1.53:22`

لا ترفع مفاتيح أو `.env` إلى هذا المستودع العام.
