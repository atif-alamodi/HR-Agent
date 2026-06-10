/*
 * وسيط Cloudflare Worker لفريق وكلاء الموارد البشرية
 * يحمل مفتاح Anthropic كسر (secret) ولا يكشفه للمتصفح.
 *
 * الأسرار المطلوبة:
 *   ANTHROPIC_API_KEY  (إلزامي)
 *   APP_TOKEN          (اختياري: رمز مشترك لمنع إساءة استخدام الوسيط العام)
 *
 * النشر:
 *   wrangler deploy
 *   wrangler secret put ANTHROPIC_API_KEY
 *   wrangler secret put APP_TOKEN        (اختياري)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-app-token",
  "Access-Control-Max-Age": "86400",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "POST") {
      return json({ error: "POST only" }, 405);
    }
    // قفل الوصول على نطاق الموقع فقط:
    // يسمح لأي جهاز يفتح موقعك (المتصفح يرسل ترويسة Origin تلقائيًا)،
    // ويمنع الاستخدام من نطاقات أخرى أو من أدوات لا ترسل Origin صحيحًا.
    const ALLOWED_ORIGINS = [
      "https://atif-alamodi.github.io",
    ];
    const origin = request.headers.get("Origin") || "";
    const referer = request.headers.get("Referer") || "";
    const originOk = ALLOWED_ORIGINS.some(
      (a) => origin === a || referer.indexOf(a + "/") === 0
    );
    if (!originOk) {
      return json({ error: "forbidden: origin not allowed" }, 403);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "server missing ANTHROPIC_API_KEY" }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "invalid json" }, 400);
    }

    // حد بسيط لحجم الطلب لحماية الوسيط (نحو 24 ميجابايت)
    const approxSize = JSON.stringify(body).length;
    if (approxSize > 24 * 1024 * 1024) {
      return json({ error: "payload too large" }, 413);
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS, "content-type": "application/json" },
    });
  },
};
