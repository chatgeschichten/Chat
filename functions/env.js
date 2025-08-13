// Liefert Supabase‑Konfig ins Frontend (aus Netlify Env)
exports.handler = async () => {
  try {
    const out = {
      SUPABASE_URL: process.env.SUPABASE_URL || "",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ""
    };
    if (!out.SUPABASE_URL || !out.SUPABASE_ANON_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "Supabase env missing" }) };
    }
    return { statusCode: 200, headers: { 'Content-Type':'application/json','Cache-Control':'no-store' }, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

