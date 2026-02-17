const APP_ID = "discount-app";

const DEFAULT_CONFIG = {
  netNewListPrice: 225,
  renewalRules: [
    { minCurrentPpl: 0, maxCurrentPpl: 108, lowestAllowedPrice: 175 },
    { minCurrentPpl: 109, maxCurrentPpl: 131, lowestAllowedPrice: 190 },
    { minCurrentPpl: 132, maxCurrentPpl: null, lowestAllowedPrice: 205 }
  ],
  netNewVolumeRules: [
    { minLicenses: 1, maxLicenses: 24, discountPct: 5 },
    { minLicenses: 25, maxLicenses: 49, discountPct: 10 },
    { minLicenses: 50, maxLicenses: 99, discountPct: 15 },
    { minLicenses: 100, maxLicenses: 249, discountPct: 20 },
    { minLicenses: 250, maxLicenses: null, discountPct: 25 }
  ]
};

function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    return null;
  }

  return { url, serviceRole };
}

async function supabaseRequest(env, path, options = {}) {
  const headers = {
    apikey: env.serviceRole,
    Authorization: `Bearer ${env.serviceRole}`,
    ...options.headers
  };

  return fetch(`${env.url}${path}`, {
    ...options,
    headers
  });
}

module.exports = async (req, res) => {
  const env = getSupabaseEnv();
  if (!env) {
    res.status(200).json({ config: DEFAULT_CONFIG, source: "default" });
    return;
  }

  if (req.method === "GET") {
    const response = await supabaseRequest(
      env,
      `/rest/v1/app_config?app_id=eq.${APP_ID}&select=config`,
      { method: "GET" }
    );

    if (!response.ok) {
      res.status(502).json({ error: "Unable to read config from Supabase." });
      return;
    }

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(200).json({ config: DEFAULT_CONFIG, source: "default" });
      return;
    }

    res.status(200).json({ config: rows[0].config, source: "supabase" });
    return;
  }

  if (req.method === "PUT") {
    const expectedPasscode = process.env.ADMIN_PASSCODE;
    if (!expectedPasscode) {
      res.status(500).json({ error: "ADMIN_PASSCODE is not configured." });
      return;
    }

    const enteredPasscode = req.headers["x-admin-passcode"];
    if (enteredPasscode !== expectedPasscode) {
      res.status(401).json({ error: "Incorrect passcode." });
      return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (!body.config || typeof body.config !== "object") {
      res.status(400).json({ error: "Missing config payload." });
      return;
    }

    const response = await supabaseRequest(env, "/rest/v1/app_config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([
        {
          app_id: APP_ID,
          config: body.config
        }
      ])
    });

    if (!response.ok) {
      const detail = await response.text();
      res.status(502).json({ error: "Unable to write config to Supabase.", detail });
      return;
    }

    const rows = await response.json();
    const saved = Array.isArray(rows) && rows[0] ? rows[0].config : body.config;
    res.status(200).json({ config: saved, source: "supabase" });
    return;
  }

  res.status(405).json({ error: "Method not allowed." });
};
