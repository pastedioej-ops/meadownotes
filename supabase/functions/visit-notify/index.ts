// "someone wandered in" — anonymous visit notifier.
//
// Receives a minimal visit ping from the public site, stamps the time
// SERVER-SIDE, and sends one Telegram message. The Telegram bot token and
// chat id live ONLY in Deno.env (Supabase secrets) — never in this file and
// never in the frontend.
//
// Privacy: this function deliberately ignores the request body, the client
// IP, and every header. The only datum it records/forwards is the timestamp.
// It does not attempt to identify, fingerprint, or track the visitor, and it
// does not try to determine who they are.

const TELEGRAM_API = "https://api.telegram.org";

// Format a Date as Asia/Manila (PHT, UTC+8): "2026-09-24 14:03:05 PHT".
function manilaTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const hh = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hh}:${get("minute")}:${get("second")} PHT`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!token || !chatId) {
    // Secrets not configured yet. Fail closed without leaking details.
    return json({ error: "not_configured" }, 500);
  }

  // The single recorded datum. Body, IP, and headers are intentionally unused.
  const visited_at = new Date().toISOString();
  const text = `someone wandered in.\n${manilaTimestamp(new Date(visited_at))}`;

  try {
    const tgRes = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    if (!tgRes.ok) {
      const detail = await tgRes.text();
      return json({ error: "telegram_send_failed", detail }, 502);
    }

    return json({ ok: true, event: "site_visit", visited_at }, 200);
  } catch (err) {
    return json({ error: "telegram_unreachable", message: String(err) }, 502);
  }
});
