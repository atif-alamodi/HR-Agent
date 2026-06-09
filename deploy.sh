#!/usr/bin/env bash
# نشر لوحة وكلاء الموارد البشرية على GitHub Pages بأمر واحد.
# المتطلبات: git و GitHub CLI (gh) مع تسجيل دخول مسبق:  gh auth login
# الاستخدام:  bash deploy.sh [اسم-المستودع] [public|private]
set -e
REPO="${1:-hr-agents-panel}"
VIS="${2:-public}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) غير مثبت. ثبّته من https://cli.github.com ثم نفّذ: gh auth login"
  exit 1
fi

# 1) تهيئة git والالتزام
if [ ! -d .git ]; then git init -q; fi
git add .
git commit -q -m "HR agents panel" || echo "لا تغييرات جديدة للالتزام."
git branch -M main

# 2) إنشاء المستودع والرفع (يستخدم جلسة gh المسجّلة لديك، دون أي رمز في الشات)
if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin main
else
  gh repo create "$REPO" --"$VIS" --source=. --remote=origin --push
fi

OWNER=$(gh api user -q .login)

# 3) تفعيل GitHub Pages على main / الجذر
echo '{"source":{"branch":"main","path":"/"}}' | gh api -X POST "repos/$OWNER/$REPO/pages" --input - >/dev/null 2>&1 \
  && echo "تم تفعيل Pages." \
  || echo "إن لم يُفعّل Pages تلقائيًا، فعّله يدويًا من Settings > Pages (الفرع main، الجذر /)."

echo ""
echo "تم الرفع. رابط الموقع بعد دقيقة تقريبًا:"
echo "https://$OWNER.github.io/$REPO/"
echo "لا تنسَ نشر الوسيط:  bash deploy-worker.sh"
