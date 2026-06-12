/*
 * وسيط Cloudflare Worker لفريق وكلاء الموارد البشرية
 * Cloudflare Workers AI المجاني. يدعم نموذجًا لكل وكيل مع رجوع تلقائي إلى النموذج السريع.
 * الحصة المجانية: 10,000 وحدة/يوم، تتجدد 00:00 UTC.
 * النشر: wrangler deploy  (يتطلب ربط [ai] باسم AI)
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

// النموذج السريع الافتراضي (8B) لبقية الوكلاء، واحتياطي عند تعذّر أي نموذج أقوى
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
// النماذج المسموح للواجهة باختيارها (قائمة بيضاء)
const ALLOWED_MODELS = {
  "@cf/meta/llama-3.1-8b-instruct-fast": 1,
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": 1,
  "@cf/mistralai/mistral-small-3.1-24b-instruct": 1,
  "@cf/meta/llama-4-scout-17b-16e-instruct": 1,
};
const ALLOWED_ORIGINS = ["https://atif-alamodi.github.io"];

function flatten(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (!b) return "";
        if (b.type === "text") return b.text || "";
        if (b.type === "image") return "[صورة مرفقة - هذا النموذج لا يقرأ الصور]";
        if (b.type === "document") return "[مستند مرفق]";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractText(out) {
  if (!out) return "";
  if (typeof out === "string") return out;
  if (Array.isArray(out.choices) && out.choices[0] && out.choices[0].message) {
    const c = out.choices[0].message.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.map((x) => (x && x.text) || "").join("");
  }
  if (typeof out.response === "string") return out.response;
  if (out.result) {
    if (typeof out.result === "string") return out.result;
    if (typeof out.result.response === "string") return out.result.response;
  }
  return "";
}

async function runModel(env, model, messages, max_tokens) {
  const noThink = model.indexOf("qwen") !== -1 ? "\n/no_think" : "";
  const msgs = noThink
    ? messages.map((m) =>
        m.role === "system" ? { role: "system", content: m.content + noThink } : m
      )
    : messages;
  const out = await env.AI.run(model, { messages: msgs, max_tokens });
  let text = extractText(out);
  if (typeof text !== "string") text = String(text || "");
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    const origin = request.headers.get("Origin") || "";
    const referer = request.headers.get("Referer") || "";
    const originOk = ALLOWED_ORIGINS.some(
      (a) => origin === a || referer.indexOf(a + "/") === 0
    );
    if (!originOk) return json({ error: "forbidden: origin not allowed" }, 403);
    if (!env.AI) return json({ error: "server missing AI binding" }, 500);

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "invalid json" }, 400);
    }

    const sys = (body.system || "").toString();
    const inMsgs = Array.isArray(body.messages) ? body.messages : [];
    const messages = [];
    if (sys) messages.push({ role: "system", content: sys });
    for (const m of inMsgs) {
      const role = m && m.role === "assistant" ? "assistant" : "user";
      const content = flatten(m && m.content);
      if (content) messages.push({ role, content });
    }
    if (messages.length === 0) return json({ error: "no messages" }, 400);

    const max_tokens = Math.min(Number(body.max_tokens) || 2048, 4096);
    const wanted = ALLOWED_MODELS[body.model] ? body.model : DEFAULT_MODEL;

    try {
      let text;
      try {
        text = await runModel(env, wanted, messages, max_tokens);
      } catch (e1) {
        // رجوع تلقائي إلى النموذج السريع إن تعذّر النموذج المطلوب
        if (wanted !== DEFAULT_MODEL) {
          text = await runModel(env, DEFAULT_MODEL, messages, max_tokens);
        } else {
          throw e1;
        }
      }
      return json({ content: [{ type: "text", text: text || "تعذّر توليد رد." }] });
    } catch (e) {
      return json(
        { error: "AI error: " + (e && e.message ? e.message : String(e)) },
        500
      );
    }
  },
};
