const form = document.getElementById("deal-form");
const dealInputsTitle = document.getElementById("deal-inputs-title");
const dealTypeSelect = document.getElementById("dealType");
const dealTypeHelp = document.getElementById("deal-type-help");
const currentSubscriptionsField = document.getElementById("current-subscriptions-field");
const currentSubscriptionsList = document.getElementById("current-subscriptions");
const currentArrValue = document.getElementById("current-arr-value");
const addSubscriptionBtn = document.getElementById("add-subscription-btn");
const proposedLicensesInput = document.getElementById("proposedLicenses");
const results = document.getElementById("results");
const errors = document.getElementById("errors");
const resetBtn = document.getElementById("reset-btn");
const submitBtn = form.querySelector('button[type="submit"]');

const fieldInputs = {
  proposedLicenses: proposedLicensesInput
};

const fieldErrorEls = {
  proposedLicenses: document.getElementById("proposedLicenses-error")
};

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function pct(value) {
  return `${value.toFixed(2)}%`;
}

function calcIarr(currentArr, newArr) {
  return newArr - currentArr;
}

function getIarrStatusClass(iarr) {
  return iarr <= 0.0001 ? "watch" : "positive";
}

function getRenewalRule(currentPpl, rules) {
  return rules.find((rule) => {
    const max = rule.maxCurrentPpl === null ? Number.POSITIVE_INFINITY : Number(rule.maxCurrentPpl);
    return currentPpl >= Number(rule.minCurrentPpl) && currentPpl <= max;
  });
}

function getSubscriptionRows() {
  return Array.from(currentSubscriptionsList.querySelectorAll("[data-subscription-row]"));
}

function getCurrentSubscriptions() {
  return getSubscriptionRows().map((row) => ({
    row,
    currentPpl: Number(row.querySelector("[data-current-ppl]").value),
    currentLicenses: Number(row.querySelector("[data-current-licenses]").value)
  }));
}

function calcCurrentArr(subscriptions) {
  return subscriptions.reduce((total, subscription) => {
    if (!Number.isFinite(subscription.currentPpl) || !Number.isFinite(subscription.currentLicenses)) return total;
    if (subscription.currentPpl < 0 || subscription.currentLicenses < 1) return total;
    return total + subscription.currentPpl * subscription.currentLicenses;
  }, 0);
}

function updateCurrentArrPreview() {
  currentArrValue.textContent = money(calcCurrentArr(getCurrentSubscriptions()));
}

function setSubscriptionError(row, key, message) {
  const input = row.querySelector(key === "currentPpl" ? "[data-current-ppl]" : "[data-current-licenses]");
  const errorEl = row.querySelector(key === "currentPpl" ? "[data-current-ppl-error]" : "[data-current-licenses-error]");
  input.classList.add("input-invalid");
  input.setAttribute("aria-invalid", "true");
  errorEl.textContent = message;
}

function updateRemoveButtons() {
  const rows = getSubscriptionRows();
  rows.forEach((row, index) => {
    row.querySelector("[data-subscription-label]").textContent = `Subscription ${index + 1}`;
    row.querySelector("[data-remove-subscription]").hidden = rows.length === 1;
  });
  updateCurrentArrPreview();
}

function createSubscriptionRow() {
  const row = document.createElement("div");
  row.className = "subscription-row";
  row.dataset.subscriptionRow = "";
  row.innerHTML = `
    <div class="subscription-row-header">
      <strong data-subscription-label>Subscription</strong>
      <button type="button" class="subscription-remove secondary" data-remove-subscription>Remove</button>
    </div>
    <div class="subscription-row-fields">
      <label class="field">
        <span>Current Contract PPL ($/year)</span>
        <input type="number" data-current-ppl step="0.01" min="0" required />
        <span class="field-error" data-current-ppl-error aria-live="polite"></span>
      </label>
      <label class="field">
        <span>Current Licenses</span>
        <input type="number" data-current-licenses step="1" min="1" required />
        <span class="field-error" data-current-licenses-error aria-live="polite"></span>
      </label>
    </div>
  `;
  currentSubscriptionsList.appendChild(row);
  updateRemoveButtons();
  return row;
}

function getVolumeRule(licenses, rules) {
  return rules.find((rule) => {
    const max = rule.maxLicenses === null ? Number.POSITIVE_INFINITY : Number(rule.maxLicenses);
    return licenses >= Number(rule.minLicenses) && licenses <= max;
  });
}

function buildDiscountRows(basePrice, maxDiscountPct, lowestAllowedPrice, currentArr, proposedLicenses) {
  const rows = [];
  let discount = 0;
  const cappedMaxDiscount = Math.max(0, Math.min(100, maxDiscountPct));

  while (discount <= cappedMaxDiscount + 0.0001) {
    const finalPrice = basePrice * (1 - discount / 100);
    if (finalPrice < lowestAllowedPrice - 0.0001) break;

    const totalArr = finalPrice * proposedLicenses;
    const iarr = calcIarr(currentArr, totalArr);

    if (iarr >= 0) {
      rows.push({ discountPct: discount, finalPrice, totalArr, iarr });
    }

    discount += 5;
  }

  const isExactMultipleOfFive = Math.abs(cappedMaxDiscount % 5) < 0.0001;
  if (!isExactMultipleOfFive) {
    const finalPrice = basePrice * (1 - cappedMaxDiscount / 100);
    const totalArr = finalPrice * proposedLicenses;
    const iarr = calcIarr(currentArr, totalArr);

    if (finalPrice >= lowestAllowedPrice - 0.0001 && iarr >= 0) {
      rows.push({ discountPct: cappedMaxDiscount, finalPrice, totalArr, iarr });
    }
  }

  return rows;
}

function clearFieldErrors() {
  Object.entries(fieldInputs).forEach(([key, input]) => {
    input.classList.remove("input-invalid");
    input.removeAttribute("aria-invalid");
    fieldErrorEls[key].textContent = "";
  });
  currentSubscriptionsList.querySelectorAll("input").forEach((input) => {
    input.classList.remove("input-invalid");
    input.removeAttribute("aria-invalid");
  });
  currentSubscriptionsList.querySelectorAll(".field-error").forEach((errorEl) => {
    errorEl.textContent = "";
  });
}

function applyFieldErrors(fieldErrors) {
  Object.entries(fieldErrors).forEach(([key, message]) => {
    const input = fieldInputs[key];
    const errorEl = fieldErrorEls[key];
    if (!input || !errorEl) return;
    input.classList.add("input-invalid");
    input.setAttribute("aria-invalid", "true");
    errorEl.textContent = message;
  });
}

function setBusyState(isBusy) {
  submitBtn.disabled = isBusy;
  submitBtn.textContent = isBusy ? "Calculating..." : "Calculate Options";
}

function renderDiscountTable(rows, emptyMessage) {
  if (rows.length === 0) {
    results.classList.remove("empty");
    results.innerHTML = `<div class="option"><h3>No compliant options</h3><p>${emptyMessage}</p></div>`;
    return;
  }

  const medianIndex = Math.floor((rows.length - 1) / 2);
  const recommendedRow = rows[medianIndex];

  const body = rows.map((row) => `
    <tr class="${recommendedRow && row.discountPct === recommendedRow.discountPct ? "is-recommended" : ""}">
      <td>${pct(row.discountPct)}</td>
      <td class="num">${money(row.finalPrice)}</td>
      <td class="num">${money(row.finalPrice / 12)}</td>
      <td class="num">${money(row.totalArr)}</td>
      <td class="num ${getIarrStatusClass(row.iarr)}">${money(row.iarr)}</td>
    </tr>
  `).join("");

  results.classList.remove("empty");
  results.innerHTML = `
    <div class="option recommended">
      <div class="recommended-header">
        <div>
          <span class="eyebrow">Recommended Option</span>
          <h3>${pct(recommendedRow.discountPct)} Discount</h3>
        </div>
        <div class="recommended-iarr ${getIarrStatusClass(recommendedRow.iarr)}">
          <span class="summary-stat-label">IARR</span>
          <span class="summary-stat-value">${money(recommendedRow.iarr)}</span>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-stat">
          <span class="summary-stat-label">Annual PPL</span>
          <span class="summary-stat-value">${money(recommendedRow.finalPrice)}</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-label">Monthly PPL</span>
          <span class="summary-stat-value">${money(recommendedRow.finalPrice / 12)}</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-label">Total ARR</span>
          <span class="summary-stat-value">${money(recommendedRow.totalArr)}</span>
        </div>
      </div>
    </div>
    <div class="option">
      <h3>Discount Options</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>% Discount</th>
              <th class="num">Annual PPL</th>
              <th class="num">PPL/Month</th>
              <th class="num">Total ARR</th>
              <th class="num">IARR</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>
  `;
}

function validateInput(input) {
  const fieldErrors = {};
  let hasSubscriptionErrors = false;

  if (!Number.isFinite(input.proposedLicenses) || input.proposedLicenses < 1) {
    fieldErrors.proposedLicenses = "Enter a proposed license count of at least 1.";
  }

  if (input.dealType === "renewal") {
    input.currentSubscriptions.forEach((subscription) => {
      if (!Number.isFinite(subscription.currentPpl) || subscription.currentPpl < 0) {
        setSubscriptionError(subscription.row, "currentPpl", "Enter a non-negative current contract PPL.");
        hasSubscriptionErrors = true;
      }
      if (!Number.isFinite(subscription.currentLicenses) || subscription.currentLicenses < 1) {
        setSubscriptionError(subscription.row, "currentLicenses", "Enter current licenses of at least 1.");
        hasSubscriptionErrors = true;
      }
    });
  }

  return { fieldErrors, hasSubscriptionErrors };
}

function validateConfig(config) {
  const messages = [];
  if (!Array.isArray(config.renewalRules) || config.renewalRules.length === 0) {
    messages.push("Amendment rules are missing.");
  }
  if (!Array.isArray(config.netNewVolumeRules) || config.netNewVolumeRules.length !== 5) {
    messages.push("Net New volume rules are missing or do not have 5 tiers.");
  }
  if (!Number.isFinite(Number(config.netNewListPrice)) || Number(config.netNewListPrice) < 0) {
    messages.push("Net New list price is invalid.");
  }
  return messages;
}

function updateDealTypeUI() {
  const isRenewal = dealTypeSelect.value === "renewal";
  dealInputsTitle.textContent = isRenewal ? "Amendment Inputs" : "Net New Inputs";
  dealTypeHelp.textContent = isRenewal
    ? "Provide all current subscriptions to protect IARR for an amendment. Subscription 1 sets the discount floor."
    : "Net New pricing uses proposed licenses only. Amendment-only fields are hidden.";
  currentSubscriptionsField.classList.toggle("hidden", !isRenewal);
  currentSubscriptionsList.querySelectorAll("input").forEach((input) => {
    input.disabled = !isRenewal;
    input.required = isRenewal;
  });
  addSubscriptionBtn.disabled = !isRenewal;

  if (!isRenewal) {
    clearFieldErrors();
  }
}

dealTypeSelect.addEventListener("change", updateDealTypeUI);
form.addEventListener("input", () => {
  errors.textContent = "";
  clearFieldErrors();
  updateCurrentArrPreview();
});
addSubscriptionBtn.addEventListener("click", () => {
  createSubscriptionRow().querySelector("[data-current-ppl]").focus();
});
currentSubscriptionsList.addEventListener("click", (event) => {
  const removeBtn = event.target.closest("[data-remove-subscription]");
  if (!removeBtn) return;

  removeBtn.closest("[data-subscription-row]").remove();
  updateRemoveButtons();
  errors.textContent = "";
  clearFieldErrors();
});
Object.values(fieldInputs).forEach((input) => {
  input.addEventListener("input", () => {
    errors.textContent = "";
    clearFieldErrors();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errors.textContent = "";
  clearFieldErrors();

  const input = {
    dealType: dealTypeSelect.value,
    currentSubscriptions: getCurrentSubscriptions(),
    proposedLicenses: Number(proposedLicensesInput.value)
  };

  const inputErrors = validateInput(input);
  if (Object.keys(inputErrors.fieldErrors).length > 0 || inputErrors.hasSubscriptionErrors) {
    applyFieldErrors(inputErrors.fieldErrors);
    errors.textContent = "Fix the highlighted fields and recalculate.";
    return;
  }

  setBusyState(true);
  try {
    const config = await window.ConfigStore.getConfig();
    const configErrors = validateConfig(config);
    if (configErrors.length > 0) {
      errors.textContent = `${configErrors.join(" ")} Ask admin to update settings.`;
      return;
    }

    if (input.dealType === "renewal") {
      const primarySubscription = input.currentSubscriptions[0];
      const rule = getRenewalRule(primarySubscription.currentPpl, config.renewalRules);
      if (!rule) {
        errors.textContent = "No amendment rule matches Subscription 1 current PPL.";
        return;
      }

      const basePrice = Number(config.netNewListPrice);
      const floorPrice = Number(rule.lowestAllowedPrice);
      const maxDiscountByFloor = (1 - (floorPrice / basePrice)) * 100;
      const currentArr = calcCurrentArr(input.currentSubscriptions);

      const rows = buildDiscountRows(
        basePrice,
        maxDiscountByFloor,
        floorPrice,
        currentArr,
        input.proposedLicenses
      );

      renderDiscountTable(
        rows,
        "No discount steps are compliant for this amendment scenario."
      );
      return;
    }

    const volumeRule = getVolumeRule(input.proposedLicenses, config.netNewVolumeRules);
    if (!volumeRule) {
      errors.textContent = "No Net New volume tier matches the proposed licenses.";
      return;
    }

    const basePrice = Number(config.netNewListPrice);
    const maxDiscount = Number(volumeRule.discountPct);
    const floorPrice = basePrice * (1 - maxDiscount / 100);
    const currentArr = 0;

    const rows = buildDiscountRows(
      basePrice,
      maxDiscount,
      floorPrice,
      currentArr,
      input.proposedLicenses
    );

    renderDiscountTable(
      rows,
      "No discount steps are compliant for this Net New scenario."
    );
  } finally {
    setBusyState(false);
  }
});

resetBtn.addEventListener("click", () => {
  form.reset();
  errors.textContent = "";
  getSubscriptionRows().slice(1).forEach((row) => row.remove());
  updateRemoveButtons();
  clearFieldErrors();
  results.classList.add("empty");
  results.textContent = "Enter values and calculate to see options.";
  dealTypeSelect.value = "renewal";
  updateDealTypeUI();
});

updateRemoveButtons();
updateCurrentArrPreview();
updateDealTypeUI();
