#!/usr/bin/env bash
# نشر وسيط Cloudflare Worker وضبط الأسرار.
# المتطلبات: wrangler مع تسجيل دخول:  npm i -g wrangler && wrangler login
set -e
if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler غير مثبت. نفّذ: npm install -g wrangler ثم: wrangler login"
  exit 1
fi
wrangler deploy
echo ""
echo "الآن اضبط مفتاح Anthropic (سيُطلب لصقه بشكل آمن في الطرفية):"
wrangler secret put ANTHROPIC_API_KEY
echo ""
echo "اختياري لتأمين الوسيط برمز تطبيق:  wrangler secret put APP_TOKEN"
echo "انسخ رابط الـ Worker الظاهر أعلاه والصقه في إعدادات الموقع."
