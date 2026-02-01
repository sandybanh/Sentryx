import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEVICE_SECRET = Deno.env.get("DEVICE_SECRET")!;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = req.headers.get("x-device-secret");
  if (!secret || secret !== DEVICE_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const { device_id, motion, ultra_close, distance_cm, alert_type } = body;

  if (typeof device_id !== "string") {
    return new Response("device_id must be string", { status: 400 });
  }
  if (typeof motion !== "boolean") {
    return new Response("motion must be boolean", { status: 400 });
  }

  const { error } = await supabase.from("sensor_events").insert({
    device_id,
    motion: !!motion,
    ultra_close: typeof ultra_close === "boolean" ? ultra_close : false,
    distance_cm: typeof distance_cm === "number" ? distance_cm : null,
  });

  if (error) return new Response(error.message, { status: 500 });

  if (motion) {
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token");

    const expoTokens = (tokens ?? []).map((row) => row.token).filter(Boolean);

    if (expoTokens.length) {
      const isUnknownFace = alert_type === "unknown_face";
      const title = isUnknownFace ? "Unknown face detected" : "Motion detected";
      const bodyText = isUnknownFace
        ? `Unknown face on ${device_id}`
        : `Motion detected on ${device_id}`;

      const message = {
        to: expoTokens,
        title,
        body: bodyText,
        data: {
          screen: "camera",
          type: isUnknownFace ? "face_alert" : "motion_alert",
          device_id,
        },
        sound: "default",
      };

      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(message),
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
