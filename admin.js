const unlockForm = document.getElementById("unlock-form");
const lockErrors = document.getElementById("lock-errors");
const lockSection = document.getElementById("lock-section");
const adminPanel = document.getElementById("admin-panel");
const netNewListPriceInput = document.getElementById("net-new-list-price");
const renewalRulesBody = document.getElementById("renewal-rules-body");
const netNewRulesBody = document.getElementById("net-new-rules-body");
const addRenewalRuleBtn = document.getElementById("add-renewal-rule-btn");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const resetSettingsBtn = document.getElementById("reset-settings-btn");
const settingsErrors = document.getElementById("settings-errors");

let configState = window.ConfigStore.cloneDefaults();
let adminPasscode = "";

function renderTables() {
  netNewListPriceInput.value = configState.netNewListPrice;

  renewalRulesBody.innerHTML = configState.renewalRules.map((rule, idx) => `
    <tr>
      <td><input type="number" step="0.01" min="0" class="renewal-min" value="${rule.minCurrentPpl}" /></td>
      <td><input type="number" step="0.01" min="0" class="renewal-max" value="${rule.maxCurrentPpl ?? ""}" placeholder="No max" /></td>
      <td><input type="number" step="0.01" min="0" class="renewal-floor" value="${rule.lowestAllowedPrice}" /></td>
      <td><button type="button" class="rule-delete" data-renewal-delete-index="${idx}">Delete</button></td>
    </tr>
  `).join("");

  netNewRulesBody.innerHTML = configState.netNewVolumeRules.map((rule) => `
    <tr>
      <td><input type="number" step="1" min="1" class="netnew-min" value="${rule.minLicenses}" /></td>
      <td><input type="number" step="1" min="1" class="netnew-max" value="${rule.maxLicenses ?? ""}" placeholder="No max" /></td>
      <td><input type="number" step="0.01" min="0" max="100" class="netnew-discount" value="${rule.discountPct}" /></td>
    </tr>
  `).join("");
}

function collectDraftConfig() {
  const renewalRows = [...renewalRulesBody.querySelectorAll("tr")];
  const netNewRows = [...netNewRulesBody.querySelectorAll("tr")];

  return {
    netNewListPrice: Number(netNewListPriceInput.value),
    renewalRules: renewalRows.map((row) => ({
      minCurrentPpl: Number(row.querySelector(".renewal-min").value),
      maxCurrentPpl: row.querySelector(".renewal-max").value === "" ? null : Number(row.querySelector(".renewal-max").value),
      lowestAllowedPrice: Number(row.querySelector(".renewal-floor").value)
    })),
    netNewVolumeRules: netNewRows.map((row) => ({
      minLicenses: Number(row.querySelector(".netnew-min").value),
      maxLicenses: row.querySelector(".netnew-max").value === "" ? null : Number(row.querySelector(".netnew-max").value),
      discountPct: Number(row.querySelector(".netnew-discount").value)
    }))
  };
}

function validateRangeSet(items, kind) {
  const errors = [];
  const rows = [...items].sort((a, b) => a.min - b.min);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Number.isFinite(row.min) || row.min < 0) {
      errors.push(`${kind} row ${i + 1}: minimum value is invalid.`);
    }
    if (row.max !== null && (!Number.isFinite(row.max) || row.max < row.min)) {
      errors.push(`${kind} row ${i + 1}: maximum must be blank or >= minimum.`);
    }
    if (i < rows.length - 1) {
      const currentMax = row.max === null ? Number.POSITIVE_INFINITY : row.max;
      const nextMin = rows[i + 1].min;
      if (currentMax >= nextMin) {
        errors.push(`${kind} rows ${i + 1} and ${i + 2}: ranges overlap.`);
      }
      if (row.max === null) {
        errors.push(`${kind} row ${i + 1}: open-ended max can only be on the final row.`);
      }
    }
  }

  return errors;
}

function validateConfig(config) {
  const errors = [];

  if (!Number.isFinite(config.netNewListPrice) || config.netNewListPrice < 0) {
    errors.push("Net New list price must be a non-negative number.");
  }

  if (!Array.isArray(config.renewalRules) || config.renewalRules.length === 0) {
    errors.push("At least one renewal rule is required.");
  } else {
    config.renewalRules.forEach((rule, idx) => {
      if (!Number.isFinite(rule.lowestAllowedPrice) || rule.lowestAllowedPrice < 0) {
        errors.push(`Renewal row ${idx + 1}: lowest allowed price must be non-negative.`);
      }
    });
    errors.push(...validateRangeSet(
      config.renewalRules.map((rule) => ({ min: rule.minCurrentPpl, max: rule.maxCurrentPpl })),
      "Renewal"
    ));
  }

  if (!Array.isArray(config.netNewVolumeRules) || config.netNewVolumeRules.length !== 5) {
    errors.push("Net New volume rules must have exactly 5 tiers.");
  } else {
    config.netNewVolumeRules.forEach((rule, idx) => {
      if (!Number.isInteger(rule.minLicenses) || rule.minLicenses < 1) {
        errors.push(`Net New row ${idx + 1}: minimum licenses must be an integer >= 1.`);
      }
      if (rule.maxLicenses !== null && (!Number.isInteger(rule.maxLicenses) || rule.maxLicenses < rule.minLicenses)) {
        errors.push(`Net New row ${idx + 1}: maximum licenses must be blank or >= minimum.`);
      }
      if (!Number.isFinite(rule.discountPct) || rule.discountPct < 0 || rule.discountPct > 100) {
        errors.push(`Net New row ${idx + 1}: discount must be between 0 and 100.`);
      }
    });

    errors.push(...validateRangeSet(
      config.netNewVolumeRules.map((rule) => ({ min: rule.minLicenses, max: rule.maxLicenses })),
      "Net New"
    ));
  }

  return errors;
}

function normalizeForSave(config) {
  return {
    netNewListPrice: config.netNewListPrice,
    renewalRules: [...config.renewalRules].sort((a, b) => a.minCurrentPpl - b.minCurrentPpl),
    netNewVolumeRules: [...config.netNewVolumeRules].sort((a, b) => a.minLicenses - b.minLicenses)
  };
}

unlockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  lockErrors.textContent = "";

  const entered = document.getElementById("admin-passcode").value;
  const isValid = await window.ConfigStore.verifyAdminPasscode(entered);
  if (!isValid) {
    lockErrors.textContent = "Incorrect passcode.";
    return;
  }

  adminPasscode = entered;
  configState = await window.ConfigStore.getConfig();
  lockSection.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  renderTables();
});

addRenewalRuleBtn.addEventListener("click", () => {
  configState.renewalRules.push({ minCurrentPpl: 0, maxCurrentPpl: null, lowestAllowedPrice: 0 });
  renderTables();
});

renewalRulesBody.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const idxRaw = target.getAttribute("data-renewal-delete-index");
  if (idxRaw === null) return;
  const idx = Number(idxRaw);
  if (Number.isNaN(idx)) return;

  configState.renewalRules.splice(idx, 1);
  renderTables();
});

saveSettingsBtn.addEventListener("click", async () => {
  settingsErrors.textContent = "";
  const draft = collectDraftConfig();
  const errors = validateConfig(draft);

  if (errors.length > 0) {
    settingsErrors.textContent = errors.join(" ");
    return;
  }

  const normalized = normalizeForSave(draft);
  try {
    configState = await window.ConfigStore.saveConfig(normalized, adminPasscode);
    renderTables();
    settingsErrors.textContent = "Settings saved.";
  } catch (error) {
    settingsErrors.textContent = error instanceof Error ? error.message : "Unable to save settings.";
  }
});

resetSettingsBtn.addEventListener("click", async () => {
  const defaults = window.ConfigStore.cloneDefaults();
  try {
    configState = await window.ConfigStore.saveConfig(defaults, adminPasscode);
    renderTables();
    settingsErrors.textContent = "Default settings restored.";
  } catch (error) {
    settingsErrors.textContent = error instanceof Error ? error.message : "Unable to reset settings.";
  }
});
