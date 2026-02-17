const CONFIG_KEY = "discount_config_v2";
const LOCAL_ADMIN_PASSCODE = "lucid1";

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

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function normalizeConfig(raw) {
  const defaults = cloneDefaults();
  if (!raw || typeof raw !== "object") return defaults;

  const netNewListPrice = Number(raw.netNewListPrice);
  const renewalRules = Array.isArray(raw.renewalRules) ? raw.renewalRules : defaults.renewalRules;
  const netNewVolumeRules = Array.isArray(raw.netNewVolumeRules) ? raw.netNewVolumeRules : defaults.netNewVolumeRules;

  return {
    netNewListPrice: Number.isFinite(netNewListPrice) ? netNewListPrice : defaults.netNewListPrice,
    renewalRules,
    netNewVolumeRules
  };
}

function loadLocalConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return cloneDefaults();
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return cloneDefaults();
  }
}

function saveLocalConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

async function fetchRemoteConfig() {
  const response = await fetch("/api/config", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load remote config.");
  }

  const payload = await response.json();
  return normalizeConfig(payload.config);
}

async function saveRemoteConfig(config, passcode) {
  const response = await fetch("/api/config", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-admin-passcode": passcode
    },
    body: JSON.stringify({ config })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = typeof payload.error === "string" ? payload.error : "Unable to save remote config.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  return normalizeConfig(payload.config);
}

async function verifyAdminPasscode(passcode) {
  try {
    const response = await fetch("/api/admin-auth", {
      method: "POST",
      headers: {
        "x-admin-passcode": passcode
      }
    });

    if (response.status === 404) {
      return passcode === LOCAL_ADMIN_PASSCODE;
    }

    return response.ok;
  } catch {
    return passcode === LOCAL_ADMIN_PASSCODE;
  }
}

async function getConfig() {
  try {
    const remote = await fetchRemoteConfig();
    saveLocalConfig(remote);
    return remote;
  } catch {
    return loadLocalConfig();
  }
}

async function saveConfig(config, passcode) {
  const normalized = normalizeConfig(config);
  try {
    const remote = await saveRemoteConfig(normalized, passcode);
    saveLocalConfig(remote);
    return remote;
  } catch (error) {
    if (error && (error.status === 401 || error.status === 403)) {
      throw error;
    }
    saveLocalConfig(normalized);
    return normalized;
  }
}

window.ConfigStore = {
  cloneDefaults,
  getConfig,
  loadLocalConfig,
  normalizeConfig,
  saveConfig,
  saveLocalConfig,
  verifyAdminPasscode
};
