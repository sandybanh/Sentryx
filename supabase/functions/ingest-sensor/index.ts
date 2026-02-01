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

  const { device_id, motion, ultra_close, distance_cm } = body;

  if (typeof device_id !== "string") {
    return new Response("device_id must be string", { status: 400 });
  }
  if (typeof motion !== "boolean") {
    return new Response("motion must be boolean", { status: 400 });
  }
  if (typeof ultra_close !== "boolean") {
    return new Response("ultra_close must be boolean", { status: 400 });
  }

  const { error } = await supabase.from("sensor_events").insert({
    device_id,
    motion,
    ultra_close,
    distance_cm: typeof distance_cm === "number" ? distance_cm : null,
  });

  if (error) return new Response(error.message, { status: 500 });

  if (motion) {
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token");

    const expoTokens = (tokens ?? []).map((row) => row.token).filter(Boolean);

    if (expoTokens.length) {
      const message = {
        to: expoTokens,
        title: "Motion detected",
        body: `Motion detected on ${device_id}`,
        data: { screen: "camera", type: "motion_alert", device_id },
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
