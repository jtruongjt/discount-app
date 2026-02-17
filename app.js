const form = document.getElementById("deal-form");
const dealTypeSelect = document.getElementById("dealType");
const currentPplInput = document.getElementById("currentPpl");
const currentLicensesInput = document.getElementById("currentLicenses");
const proposedLicensesInput = document.getElementById("proposedLicenses");
const results = document.getElementById("results");
const errors = document.getElementById("errors");
const resetBtn = document.getElementById("reset-btn");

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
      rows.push({ discountPct: discount, finalPrice });
    }

    discount += 5;
  }

  const isExactMultipleOfFive = Math.abs(cappedMaxDiscount % 5) < 0.0001;
  if (!isExactMultipleOfFive) {
    const finalPrice = basePrice * (1 - cappedMaxDiscount / 100);
    const newArr = finalPrice * proposedLicenses;
    const iarr = calcIarr(currentArr, newArr);

    if (finalPrice >= lowestAllowedPrice - 0.0001 && iarr >= 0) {
      rows.push({ discountPct: cappedMaxDiscount, finalPrice });
    }
  }

  return rows;
}

function renderDiscountTable(rows, contextMessage, emptyMessage) {
  if (rows.length === 0) {
    results.classList.remove("empty");
    results.innerHTML = `<div class="option"><h3>No compliant options</h3><p>${emptyMessage}</p></div>`;
    return;
  }

  const body = rows.map((row) => `
    <tr>
      <td>${pct(row.discountPct)}</td>
      <td>${money(row.finalPrice)}</td>
      <td>${money(row.finalPrice / 12)}</td>
    </tr>
  `).join("");

  results.classList.remove("empty");
  results.innerHTML = `
    <div class="option">
      <h3>Discount Options</h3>
      <p class="meta">${contextMessage}</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>% Discount</th>
              <th>Price After Discount</th>
              <th>PPL/Month</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>
  `;
}

function validateInput(input) {
  const messages = [];

  if (!Number.isFinite(input.proposedLicenses) || input.proposedLicenses < 1) {
    messages.push("Proposed licenses must be at least 1.");
  }

  if (input.dealType === "renewal") {
    if (!Number.isFinite(input.currentPpl) || input.currentPpl < 0) {
      messages.push("Current contract PPL must be a non-negative number for ammendments.");
    }
    if (!Number.isFinite(input.currentLicenses) || input.currentLicenses < 1) {
      messages.push("Current licenses must be at least 1 for ammendments.");
    }
  }

  return messages;
}

function validateConfig(config) {
  const messages = [];
  if (!Array.isArray(config.renewalRules) || config.renewalRules.length === 0) {
    messages.push("Ammendment rules are missing.");
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
  currentPplInput.disabled = !isRenewal;
  currentLicensesInput.disabled = !isRenewal;

  if (!isRenewal) {
    currentPplInput.value = "";
    currentLicensesInput.value = "";
  }
}

dealTypeSelect.addEventListener("change", updateDealTypeUI);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errors.textContent = "";

  const input = {
    dealType: dealTypeSelect.value,
    currentPpl: Number(currentPplInput.value),
    currentLicenses: Number(currentLicensesInput.value),
    proposedLicenses: Number(proposedLicensesInput.value)
  };

  const inputErrors = validateInput(input);
  if (inputErrors.length > 0) {
    errors.textContent = inputErrors.join(" ");
    return;
  }

  const config = await window.ConfigStore.getConfig();
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    errors.textContent = `${configErrors.join(" ")} Ask admin to update settings.`;
    return;
  }

  if (input.dealType === "renewal") {
    const rule = getRenewalRule(input.currentPpl, config.renewalRules);
    if (!rule) {
      errors.textContent = "No ammendment rule matches this current PPL.";
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
      `Ammendment rule floor is ${money(floorPrice)}. Showing 5% discount steps from list price ${money(basePrice)}.`,
      "No discount steps are compliant for this ammendment scenario."
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
    `Net New tier allows up to ${pct(maxDiscount)} discount. Showing 5% discount steps from list price ${money(basePrice)}.`,
    "No discount steps are compliant for this Net New scenario."
  );
});

resetBtn.addEventListener("click", () => {
  form.reset();
  errors.textContent = "";
  results.classList.add("empty");
  results.textContent = "Enter values and calculate to see options.";
  dealTypeSelect.value = "renewal";
  updateDealTypeUI();
});

updateDealTypeUI();
