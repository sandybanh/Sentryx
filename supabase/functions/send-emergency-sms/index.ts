// Supabase Edge Function: send-emergency-sms
// Sends an emergency SMS to all contacts saved for the authenticated user.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioFrom = Deno.env.get('TWILIO_FROM_NUMBER');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Supabase env' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!twilioSid || !twilioToken || !twilioFrom) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Twilio env' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    console.log('Auth header present:', !!authHeader, 'starts with Bearer:', authHeader.startsWith('Bearer '));

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    console.log('getUser result:', userError ? `error: ${userError.message}` : `user: ${userData?.user?.id}`);

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized', details: userError?.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { message } = await req.json();
    const body = typeof message === 'string' && message.length > 0
      ? message
      : 'Emergency alert from Sentryx.';

    const { data: contacts, error: contactsError } = await supabase
      .from('emergency_contacts')
      .select('phone')
      .eq('user_id', userData.user.id);

    if (contactsError) {
      return new Response(JSON.stringify({ success: false, error: contactsError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const phones = (contacts ?? []).map((c) => c.phone).filter(Boolean);
    if (!phones.length) {
      return new Response(JSON.stringify({ success: false, error: 'No contacts found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const auth = btoa(`${twilioSid}:${twilioToken}`);

    const sendResults = await Promise.all(
      phones.map(async (to) => {
        const form = new URLSearchParams();
        form.set('To', to);
        form.set('From', twilioFrom);
        form.set('Body', body);

        const res = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });

        if (!res.ok) {
          const text = await res.text();
          return { to, ok: false, error: text };
        }

        return { to, ok: true };
      })
    );

    const failed = sendResults.filter((result) => !result.ok);
    if (failed.length) {
      return new Response(JSON.stringify({ success: false, error: failed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ success: true, results: sendResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
