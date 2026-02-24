const form = document.getElementById("deal-form");
const dealInputsTitle = document.getElementById("deal-inputs-title");
const dealTypeSelect = document.getElementById("dealType");
const dealTypeHelp = document.getElementById("deal-type-help");
const currentPplField = document.getElementById("current-ppl-field");
const currentLicensesField = document.getElementById("current-licenses-field");
const currentPplInput = document.getElementById("currentPpl");
const currentLicensesInput = document.getElementById("currentLicenses");
const proposedLicensesInput = document.getElementById("proposedLicenses");
const results = document.getElementById("results");
const errors = document.getElementById("errors");
const resetBtn = document.getElementById("reset-btn");
const submitBtn = form.querySelector('button[type="submit"]');

const fieldInputs = {
  currentPpl: currentPplInput,
  currentLicenses: currentLicensesInput,
  proposedLicenses: proposedLicensesInput
};

const fieldErrorEls = {
  currentPpl: document.getElementById("currentPpl-error"),
  currentLicenses: document.getElementById("currentLicenses-error"),
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

function getRenewalRule(currentPpl, rules) {
  return rules.find((rule) => {
    const max = rule.maxCurrentPpl === null ? Number.POSITIVE_INFINITY : Number(rule.maxCurrentPpl);
    return currentPpl >= Number(rule.minCurrentPpl) && currentPpl <= max;
  });
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

    const newArr = finalPrice * proposedLicenses;
    const iarr = calcIarr(currentArr, newArr);

    if (iarr >= 0) {
      rows.push({ discountPct: discount, finalPrice, iarr });
    }

    discount += 5;
  }

  const isExactMultipleOfFive = Math.abs(cappedMaxDiscount % 5) < 0.0001;
  if (!isExactMultipleOfFive) {
    const finalPrice = basePrice * (1 - cappedMaxDiscount / 100);
    const newArr = finalPrice * proposedLicenses;
    const iarr = calcIarr(currentArr, newArr);

    if (finalPrice >= lowestAllowedPrice - 0.0001 && iarr >= 0) {
      rows.push({ discountPct: cappedMaxDiscount, finalPrice, iarr });
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

function renderDiscountTable(rows, contextMessage, emptyMessage) {
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
      <td>${money(row.finalPrice)}</td>
      <td>${money(row.finalPrice / 12)}</td>
      <td>${money(row.iarr)}</td>
    </tr>
  `).join("");

  results.classList.remove("empty");
  results.innerHTML = `
    <div class="option recommended">
      <h3>Recommended Option</h3>
      <p class="meta">${contextMessage}</p>
      <div class="summary-grid">
        <div class="summary-stat">
          <span class="summary-stat-label">Discount</span>
          <span class="summary-stat-value">${pct(recommendedRow.discountPct)}</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-label">Annual PPL</span>
          <span class="summary-stat-value">${money(recommendedRow.finalPrice)}</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-label">Monthly PPL</span>
          <span class="summary-stat-value">${money(recommendedRow.finalPrice / 12)}</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-label">IARR</span>
          <span class="summary-stat-value">${money(recommendedRow.iarr)}</span>
        </div>
      </div>
      <p class="meta">Showing ${rows.length} compliant option${rows.length === 1 ? "" : "s"} in 5% increments. Highlighted row is the median option${rows.length % 2 === 0 ? " (lower middle of the two center rows)" : ""}.</p>
    </div>
    <div class="option">
      <h3>Discount Options</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>% Discount</th>
              <th>Annual PPL</th>
              <th>PPL/Month</th>
              <th>IARR</th>
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

  if (!Number.isFinite(input.proposedLicenses) || input.proposedLicenses < 1) {
    fieldErrors.proposedLicenses = "Enter a proposed license count of at least 1.";
  }

  if (input.dealType === "renewal") {
    if (!Number.isFinite(input.currentPpl) || input.currentPpl < 0) {
      fieldErrors.currentPpl = "Enter a non-negative current contract PPL for amendments.";
    }
    if (!Number.isFinite(input.currentLicenses) || input.currentLicenses < 1) {
      fieldErrors.currentLicenses = "Enter current licenses of at least 1 for amendments.";
    }
  }

  return fieldErrors;
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
    ? "Provide current contract PPL and current licenses to protect IARR for an amendment."
    : "Net New pricing uses proposed licenses only. Amendment-only fields are hidden.";
  currentPplField.classList.toggle("hidden", !isRenewal);
  currentLicensesField.classList.toggle("hidden", !isRenewal);
  currentPplInput.disabled = !isRenewal;
  currentLicensesInput.disabled = !isRenewal;
  currentPplInput.required = isRenewal;
  currentLicensesInput.required = isRenewal;

  if (!isRenewal) {
    currentPplInput.value = "";
    currentLicensesInput.value = "";
    clearFieldErrors();
  }
}

dealTypeSelect.addEventListener("change", updateDealTypeUI);
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
    currentPpl: Number(currentPplInput.value),
    currentLicenses: Number(currentLicensesInput.value),
    proposedLicenses: Number(proposedLicensesInput.value)
  };

  const inputErrors = validateInput(input);
  if (Object.keys(inputErrors).length > 0) {
    applyFieldErrors(inputErrors);
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
      const rule = getRenewalRule(input.currentPpl, config.renewalRules);
      if (!rule) {
        errors.textContent = "No amendment rule matches this current PPL.";
        return;
      }

      const basePrice = Number(config.netNewListPrice);
      const floorPrice = Number(rule.lowestAllowedPrice);
      const maxDiscountByFloor = (1 - (floorPrice / basePrice)) * 100;
      const currentArr = input.currentPpl * input.currentLicenses;

      const rows = buildDiscountRows(
        basePrice,
        maxDiscountByFloor,
        floorPrice,
        currentArr,
        input.proposedLicenses
      );

      renderDiscountTable(
        rows,
        `Amendment rule floor is ${money(floorPrice)} against list price ${money(basePrice)}.`,
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
      `Net New tier allows up to ${pct(maxDiscount)} discount from list price ${money(basePrice)} (floor ${money(floorPrice)}).`,
      "No discount steps are compliant for this Net New scenario."
    );
  } finally {
    setBusyState(false);
  }
});

resetBtn.addEventListener("click", () => {
  form.reset();
  errors.textContent = "";
  clearFieldErrors();
  results.classList.add("empty");
  results.textContent = "Enter values and calculate to see options.";
  dealTypeSelect.value = "renewal";
  updateDealTypeUI();
});

updateDealTypeUI();
