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

  const secret = req.headers.get("x-device-secret") ?? "";
  if (!DEVICE_SECRET || secret !== DEVICE_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const device_id = String(body.device_id ?? "unknown");
  const motionFlag = body.motion ? true : false;
  const ultraCloseFlag = body.ultra_close ? true : false;

  const { error } = await supabase
    .from("sensor_events")
    .insert([{ device_id, motion: motionFlag, ultra_close: ultraCloseFlag }]);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (motionFlag) {
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
    headers: { "Content-Type": "application/json" },
  });
});
