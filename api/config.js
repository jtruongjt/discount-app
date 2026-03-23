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

let neonModulePromise;

function getDatabaseUrl() {
  return process.env.DATABASE_URL || null;
}

async function getSqlClient() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return null;
  }

  if (!neonModulePromise) {
    neonModulePromise = import("@neondatabase/serverless");
  }

  const { neon } = await neonModulePromise;
  return neon(databaseUrl);
}

function parseBody(body) {
  if (typeof body === "string") {
    return JSON.parse(body || "{}");
  }

  return body || {};
}

module.exports = async (req, res) => {
  const hasDatabaseConfig = Boolean(getDatabaseUrl());
  let sql = null;

  try {
    sql = await getSqlClient();
  } catch {
    if (req.method === "GET") {
      res.status(502).json({ error: "Unable to initialize Neon client." });
      return;
    }

    if (req.method === "PUT") {
      res.status(500).json({ error: "Unable to initialize Neon client." });
      return;
    }
  }

  if (req.method === "GET") {
    if (hasDatabaseConfig && !sql) {
      res.status(502).json({ error: "Unable to initialize Neon client." });
      return;
    }

    if (!sql) {
      res.status(200).json({ config: DEFAULT_CONFIG, source: "default" });
      return;
    }

    try {
      const rows = await sql`
        SELECT config
        FROM app_config
        WHERE app_id = ${APP_ID}
        LIMIT 1
      `;

      if (!Array.isArray(rows) || rows.length === 0) {
        res.status(200).json({ config: DEFAULT_CONFIG, source: "default" });
        return;
      }

      res.status(200).json({ config: rows[0].config, source: "neon" });
    } catch {
      res.status(502).json({ error: "Unable to read config from Neon." });
    }
    return;
  }

  if (req.method === "PUT") {
    if (hasDatabaseConfig && !sql) {
      res.status(500).json({ error: "Unable to initialize Neon client." });
      return;
    }

    if (!sql) {
      res.status(500).json({ error: "DATABASE_URL must be configured." });
      return;
    }

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

    let body;
    try {
      body = parseBody(req.body);
    } catch {
      res.status(400).json({ error: "Request body must be valid JSON." });
      return;
    }

    if (!body.config || typeof body.config !== "object") {
      res.status(400).json({ error: "Missing config payload." });
      return;
    }

    try {
      const rows = await sql`
        INSERT INTO app_config (app_id, config, updated_at)
        VALUES (${APP_ID}, ${JSON.stringify(body.config)}::jsonb, NOW())
        ON CONFLICT (app_id)
        DO UPDATE SET
          config = EXCLUDED.config,
          updated_at = NOW()
        RETURNING config
      `;

      const saved = Array.isArray(rows) && rows[0] ? rows[0].config : body.config;
      res.status(200).json({ config: saved, source: "neon" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      res.status(502).json({ error: "Unable to write config to Neon.", detail });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed." });
};
