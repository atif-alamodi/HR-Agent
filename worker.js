/*
 * وسيط Cloudflare Worker لفريق وكلاء الموارد البشرية
 * Cloudflare Workers AI المجاني. نموذج سريع لتقليل زمن الاستجابة.
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

// نموذج سريع (8B) لخفض زمن الاستجابة مع عربية مقبولة
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
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
    // تعطيل التفكير فقط لنماذج Qwen
    const noThink = MODEL.indexOf("qwen") !== -1 ? "\n/no_think" : "";
    if (sys) messages.push({ role: "system", content: sys + noThink });
    for (const m of inMsgs) {
      const role = m && m.role === "assistant" ? "assistant" : "user";
      const content = flatten(m && m.content);
      if (content) messages.push({ role, content });
    }
    if (messages.length === 0) return json({ error: "no messages" }, 400);

    const max_tokens = Math.min(Number(body.max_tokens) || 1024, 1024);

    try {
      const out = await env.AI.run(MODEL, { messages, max_tokens });
      let text = extractText(out);
      if (typeof text !== "string") text = String(text || "");
      text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      return json({ content: [{ type: "text", text: text || "تعذّر توليد رد." }] });
    } catch (e) {
      return json(
        { error: "AI error: " + (e && e.message ? e.message : String(e)) },
        500
      );
    }
  },
};
