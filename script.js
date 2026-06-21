const DEFAULTS = {
  startAge: 22,
  deathAge: 85,
  monthlyIncome: 20000,
  monthlyExpense: 9000,
  passiveIncome: 0,
  initialAssets: 50000,
  workReturn: 5,
  retireReturn: 4,
  oneTimeGoal: 0,
  legacyGoal: 0,
  safetyMargin: 10,
  enableHome: false,
  homeAge: 30,
  homeDownPayment: 600000,
  mortgagePrincipal: 1300000,
  mortgageRate: 4,
  mortgageMonthly: 7000,
  mortgageYears: 25,
  homeMaintenanceMonthly: 800,
  enableMarriage: false,
  marriageAge: 28,
  weddingCost: 120000,
  spouseContribution: 5000,
  enableChildren: false,
  childAge: 32,
  childCount: 1,
  birthCost: 50000,
  childMonthlyCost: 3500,
  childSupportYears: 22,
  educationCost: 200000,
  educationAge: 12,
  childMarriageGift: 100000,
  childMarriageGiftAge: 25,
  enableParents: false,
  parentSupportStartAge: 45,
  parentSupportEndAge: 75,
  parentMonthlySupport: 3000,
  parentEmergencyFund: 100000,
  parentEmergencyAge: 60,
  enableMedicalReserve: false,
  medicalReserveAge: 65,
  medicalReserve: 500000,
  enableElderlyMedicalMonthly: false,
  elderlyMedicalStartAge: 65,
  elderlyMedicalMonthly: 2000,
};

const STORAGE_KEY = "financial-freedom-calculator:v1";
const PRESETS_KEY = "financial-freedom-calculator:presets:v1";
const ALERT_DISMISSED_KEY = "financial-freedom-calculator:inflation-alert-dismissed";
const MAX_PRESETS = 8;
const ids = Object.keys(DEFAULTS);
const inputs = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const output = {
  statusCard: document.getElementById("statusCard"),
  statusBadge: document.getElementById("statusBadge"),
  workDuration: document.getElementById("workDuration"),
  retireAge: document.getElementById("retireAge"),
  requiredAssets: document.getElementById("requiredAssets"),
  retireAssets: document.getElementById("retireAssets"),
  monthlySurplus: document.getElementById("monthlySurplus"),
  peakOutflow: document.getElementById("peakOutflow"),
  totalIncome: document.getElementById("totalIncome"),
  totalExpense: document.getElementById("totalExpense"),
  eventExpense: document.getElementById("eventExpense"),
  medicalReserveDisplay: document.getElementById("medicalReserveDisplay"),
  eventTimeline: document.getElementById("eventTimeline"),
  boardStatus: document.getElementById("boardStatus"),
  boardPreview: document.getElementById("boardPreview"),
  downloadBoardLink: document.getElementById("downloadBoardLink"),
};

const canvas = document.getElementById("assetChart");
const ctx = canvas.getContext("2d");
const appShell = document.querySelector(".app-shell");
const incomeStepList = document.getElementById("incomeStepList");
const childBirthList = document.getElementById("childBirthList");
const addIncomeStepButton = document.getElementById("addIncomeStepButton");
const inflationAlert = document.getElementById("inflationAlert");
const dismissInflationAlertButton = document.getElementById("dismissInflationAlert");
const mobilePageDots = Array.from(document.querySelectorAll(".mobile-page-indicator span"));
const quickSettings = document.getElementById("quickSettings");
const presetMenuButton = document.getElementById("presetMenuButton");
const presetPanel = document.getElementById("presetPanel");
const presetList = document.getElementById("presetList");
const presetNameInput = document.getElementById("presetName");
const savePresetButton = document.getElementById("savePresetButton");
const presetStatus = document.getElementById("presetStatus");
const mortgageFieldIds = ["mortgagePrincipal", "mortgageRate", "mortgageMonthly", "mortgageYears"];
let incomeSteps = [];
let childBirthAges = [DEFAULTS.childAge];
let latestResult = null;
let boardGenerated = false;
let mobileSnapTimer = 0;

function toNumber(value, fallback = 0) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeIncomeSteps(steps) {
  if (!Array.isArray(steps)) return [];

  return steps
    .map((step) => ({
      age: toNumber(step.age, Number.NaN),
      income: toNumber(step.income, Number.NaN),
    }))
    .filter((step) => Number.isFinite(step.age) && Number.isFinite(step.income) && step.age >= 0 && step.income >= 0)
    .sort((a, b) => a.age - b.age)
    .slice(0, 12);
}

function normalizeChildBirthAges(values, count, fallbackAge = DEFAULTS.childAge) {
  const safeCount = clamp(Math.floor(toNumber(count, DEFAULTS.childCount)), 0, 8);
  if (safeCount === 0) return [];

  const source = Array.isArray(values) ? values : [];
  const ages = [];
  let previousAge = clamp(toNumber(fallbackAge, DEFAULTS.childAge), 0, 130);

  for (let index = 0; index < safeCount; index += 1) {
    const sourceAge = toNumber(source[index], Number.NaN);
    const age = Number.isFinite(sourceAge) ? sourceAge : index === 0 ? previousAge : previousAge + 3;
    previousAge = clamp(age, 0, 130);
    ages.push(previousAge);
  }

  return ages;
}

function readSavedParams() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || !saved.values) return null;
    const values = saved.values;

    if ("enableMedical" in values) {
      if (!("enableMedicalReserve" in values)) values.enableMedicalReserve = Boolean(values.enableMedical);
      if (!("enableElderlyMedicalMonthly" in values)) {
        values.enableElderlyMedicalMonthly = Boolean(values.enableMedical);
      }
    }

    if (!Array.isArray(values.childBirthAges)) {
      values.childBirthAges = [toNumber(values.childAge, DEFAULTS.childAge)];
    }

    if (!Array.isArray(values.incomeSteps)) {
      values.incomeSteps = [];
    }

    if (!("spouseContribution" in values)) {
      values.spouseContribution = Math.max(0, toNumber(values.spouseIncome, 0) - toNumber(values.spouseExpense, 0));
    }

    return values;
  } catch {
    return null;
  }
}

function applyParams(values) {
  if (!values || typeof values !== "object") return;

  ids.forEach((id) => {
    const input = inputs[id];
    if (!input || !(id in values)) return;
    if (input.type === "checkbox") {
      input.checked = Boolean(values[id]);
    } else {
      input.value = values[id];
    }
  });

  incomeSteps = sanitizeIncomeSteps(values.incomeSteps);
  const fallbackChildAge = toNumber(values.childAge, DEFAULTS.childAge);
  childBirthAges = normalizeChildBirthAges(values.childBirthAges, toNumber(values.childCount, DEFAULTS.childCount), fallbackChildAge);
  if (inputs.childAge) inputs.childAge.value = childBirthAges[0] ?? DEFAULTS.childAge;
}

function saveParams(params) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        values: params,
      }),
    );
  } catch {
    // Local storage can be unavailable in private or restricted browser modes.
  }
}

function normalizePresetValues(values) {
  const source = values && typeof values === "object" ? values : {};
  const merged = { ...DEFAULTS, ...source };
  if (!("spouseContribution" in source)) {
    merged.spouseContribution = Math.max(0, toNumber(source.spouseIncome, 0) - toNumber(source.spouseExpense, 0));
  }
  merged.incomeSteps = sanitizeIncomeSteps(source.incomeSteps);
  merged.childBirthAges = normalizeChildBirthAges(
    source.childBirthAges,
    toNumber(merged.childCount, DEFAULTS.childCount),
    toNumber(merged.childAge, DEFAULTS.childAge),
  );
  merged.childAge = merged.childBirthAges[0] ?? toNumber(merged.childAge, DEFAULTS.childAge);
  return merged;
}

function readPresets() {
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const presets = JSON.parse(raw);
    if (!Array.isArray(presets)) return [];

    return presets
      .map((preset) => ({
        id: String(preset.id || ""),
        name: String(preset.name || "").trim(),
        savedAt: String(preset.savedAt || ""),
        values: normalizePresetValues(preset.values),
      }))
      .filter((preset) => preset.id && preset.name)
      .slice(0, MAX_PRESETS);
  } catch {
    return [];
  }
}

function savePresets(presets) {
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)));
    return true;
  } catch {
    return false;
  }
}

function presetId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function presetMeta(values) {
  return `月入 ${formatCurrency(values.monthlyIncome)} · 月开销 ${formatCurrency(values.monthlyExpense)}`;
}

function setPresetStatus(message) {
  if (presetStatus) presetStatus.textContent = message;
}

function renderPresets() {
  if (!presetList) return;
  const presets = readPresets();
  presetList.innerHTML = "";

  if (!presets.length) {
    const empty = document.createElement("p");
    empty.className = "preset-empty";
    empty.textContent = "还没有保存的方案。可以先调整参数，再把当前输入保存为一个快速设置。";
    presetList.append(empty);
    return;
  }

  presets.forEach((preset) => {
    const item = document.createElement("article");
    item.className = "preset-item";

    const main = document.createElement("div");
    main.className = "preset-main";

    const name = document.createElement("div");
    name.className = "preset-name";
    name.textContent = preset.name;

    const meta = document.createElement("div");
    meta.className = "preset-meta";
    meta.textContent = presetMeta(preset.values);

    const actions = document.createElement("div");
    actions.className = "preset-actions";

    const applyButton = document.createElement("button");
    applyButton.className = "preset-action primary";
    applyButton.type = "button";
    applyButton.textContent = "应用";
    applyButton.dataset.presetAction = "apply";
    applyButton.dataset.presetId = preset.id;

    const deleteButton = document.createElement("button");
    deleteButton.className = "preset-action danger";
    deleteButton.type = "button";
    deleteButton.textContent = "删除";
    deleteButton.dataset.presetAction = "delete";
    deleteButton.dataset.presetId = preset.id;

    main.append(name, meta);
    actions.append(applyButton, deleteButton);
    item.append(main, actions);
    presetList.append(item);
  });
}

function setPresetPanelOpen(open) {
  if (!presetPanel || !presetMenuButton) return;
  presetPanel.hidden = !open;
  presetMenuButton.setAttribute("aria-expanded", String(open));
  if (open) renderPresets();
}

function saveCurrentPreset() {
  const presets = readPresets();
  const fallbackName = `方案 ${presets.length + 1}`;
  const name = (presetNameInput?.value || "").trim() || fallbackName;
  const values = readParams();
  const savedAt = new Date().toISOString();
  const existingIndex = presets.findIndex((preset) => preset.name === name);

  if (existingIndex >= 0) {
    presets[existingIndex] = { ...presets[existingIndex], name, savedAt, values };
  } else {
    if (presets.length >= MAX_PRESETS) {
      setPresetStatus(`最多保存 ${MAX_PRESETS} 个方案，请先删除一个。`);
      return;
    }
    presets.unshift({ id: presetId(), name, savedAt, values });
  }

  if (!savePresets(presets)) {
    setPresetStatus("浏览器无法写入本地存储，方案暂时没有保存成功。");
    return;
  }

  if (presetNameInput) presetNameInput.value = "";
  renderPresets();
  setPresetStatus(existingIndex >= 0 ? `已更新「${name}」。` : `已保存「${name}」。`);
}

function applyPreset(preset) {
  applyParams(preset.values);
  renderIncomeSteps();
  renderChildBirthRows();
  updateUI();
  setPresetPanelOpen(false);
  setPresetStatus(`已应用「${preset.name}」。`);
}

function isInflationAlertDismissed() {
  try {
    return window.localStorage.getItem(ALERT_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function dismissInflationAlert() {
  if (inflationAlert) inflationAlert.classList.add("is-hidden");
  try {
    window.localStorage.setItem(ALERT_DISMISSED_KEY, "true");
  } catch {
    // The alert can still be closed for the current session.
  }
}

function isMobilePager() {
  return window.matchMedia("(max-width: 740px)").matches;
}

function mobileMaxScroll() {
  if (!appShell) return 0;
  return Math.max(0, appShell.scrollWidth - appShell.clientWidth);
}

function currentMobilePage() {
  const maxScroll = mobileMaxScroll();
  if (maxScroll <= 0) return 0;
  return appShell.scrollLeft > maxScroll / 2 ? 1 : 0;
}

function updateMobilePageIndicator() {
  if (!mobilePageDots.length) return;
  const page = currentMobilePage();
  mobilePageDots.forEach((dot, index) => {
    dot.classList.toggle("active", index === page);
  });
}

function snapMobilePage() {
  if (!isMobilePager() || !appShell) return;
  const maxScroll = mobileMaxScroll();
  const target = currentMobilePage() === 1 ? maxScroll : 0;
  appShell.scrollTo({ left: target, behavior: "smooth" });
  updateMobilePageIndicator();
}

function scheduleMobileSnap() {
  if (!isMobilePager()) return;
  window.clearTimeout(mobileSnapTimer);
  mobileSnapTimer = window.setTimeout(snapMobilePage, 120);
  updateMobilePageIndicator();
}

function numberValue(id) {
  const input = inputs[id];
  if (!input) return DEFAULTS[id] ?? 0;
  if (input.type === "checkbox") return input.checked;
  return Number.parseFloat(input.value) || 0;
}

function readIncomeStepRows() {
  const rows = Array.from(incomeStepList.querySelectorAll("[data-income-step-row]"));
  return sanitizeIncomeSteps(
    rows.map((row) => ({
      age: row.querySelector("[data-income-age]")?.value,
      income: row.querySelector("[data-income-amount]")?.value,
    })),
  );
}

function readChildBirthRows(count, fallbackAge) {
  const values = Array.from(childBirthList.querySelectorAll("[data-child-birth-age]")).map((input) => input.value);
  return normalizeChildBirthAges(values, count, fallbackAge);
}

function readParams() {
  const params = Object.fromEntries(ids.map((id) => [id, numberValue(id)]));
  params.incomeSteps = readIncomeStepRows();
  params.childBirthAges = readChildBirthRows(params.childCount, params.childAge);
  params.childAge = params.childBirthAges[0] ?? DEFAULTS.childAge;
  return params;
}

function monthlyRate(annualPercent) {
  return Math.pow(1 + annualPercent / 100, 1 / 12) - 1;
}

function trimNumber(value) {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function formatCurrency(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 100000000) {
    return `${sign}${trimNumber(abs / 100000000)} 亿`;
  }

  if (abs >= 10000) {
    return `${sign}${trimNumber(abs / 10000)} 万`;
  }

  return `${sign}${Math.round(abs).toLocaleString("zh-CN")} 元`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${trimNumber(value * 100)}%`;
}

function formatDuration(months) {
  if (months <= 0) return "现在";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} 个月`;
  if (rest === 0) return `${years} 年`;
  return `${years} 年 ${rest} 个月`;
}

function formatAge(startAge, months) {
  return trimNumber(startAge + months / 12);
}

function chartHorizonMonth(result) {
  return result.bankruptcyMonth === null ? result.model.totalLifeMonths : result.bankruptcyMonth;
}

function visibleAssetSeries(result) {
  const points = [];

  for (let index = 0; index < result.series.length; index += 1) {
    const point = result.series[index];
    if (point.assets >= 0) {
      points.push(point);
      continue;
    }

    const previous = points[points.length - 1];
    if (previous && previous.assets > 0) {
      const ratio = previous.assets / (previous.assets - point.assets);
      points.push({
        month: previous.month + (point.month - previous.month) * ratio,
        assets: 0,
      });
    } else if (!previous) {
      points.push({ month: point.month, assets: 0 });
    }
    break;
  }

  return points;
}

function visibleTargetSeries(result) {
  const horizon = chartHorizonMonth(result);
  return result.targetSeries.filter((point) => point.month <= horizon);
}

function shortEventName(event) {
  const name = event.name;
  const childMatch = name.match(/^第\s*(\d+)\s*个孩子(.+)$/);

  if (childMatch) {
    const child = `孩${childMatch[1]}`;
    const suffix = childMatch[2];
    if (suffix.includes("出生")) return `${child}出生`;
    if (suffix.includes("养育开始")) return `${child}养育`;
    if (suffix.includes("养育结束")) return `${child}养育止`;
    if (suffix.includes("教育")) return `${child}教育`;
    if (suffix.includes("彩礼") || suffix.includes("婚嫁")) return `${child}婚嫁`;
    return child;
  }

  const replacements = {
    买房首付: "买房",
    房贷开始: "房贷",
    房贷结束: "房贷止",
    物业维护开始: "物业",
    结婚安家: "结婚",
    伴侣分担: "伴侣分担",
    父母赡养开始: "父母赡养",
    父母赡养结束: "赡养止",
    父母应急储备: "父母应急",
    养老储备金: "养老储备",
    养老月预算开始: "养老预算",
    收入阶段: "收入变化",
  };

  return replacements[name] || name;
}

function compactEventLabel(events) {
  const labels = [...new Set(events.map((event) => shortEventName(event)))];
  if (labels.length <= 2) return labels.join(" / ");
  return `${labels.slice(0, 2).join(" / ")} +${labels.length - 2}`;
}

function formatInputNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "";
  const rounded = Number(value.toFixed(decimals));
  return String(rounded);
}

function ageToMonth(age, params) {
  return Math.round((age - params.startAge) * 12);
}

function monthToAge(month, params) {
  return params.startAge + month / 12;
}

function formatAgeBand(start) {
  return `${start}-${start + 10}岁`;
}

function inLife(month, totalLifeMonths) {
  return month >= 0 && month <= totalLifeMonths;
}

function mortgagePayment(principal, annualRate, years) {
  const months = years * 12;
  if (principal <= 0 || months <= 0) return 0;
  const rate = monthlyRate(annualRate);
  if (Math.abs(rate) < 0.0000001) return principal / months;
  return (principal * rate) / (1 - Math.pow(1 + rate, -months));
}

function mortgagePrincipal(payment, annualRate, years) {
  const months = years * 12;
  if (payment <= 0 || months <= 0) return 0;
  const rate = monthlyRate(annualRate);
  if (Math.abs(rate) < 0.0000001) return payment * months;
  return (payment * (1 - Math.pow(1 + rate, -months))) / rate;
}

function mortgageYears(payment, principal, annualRate) {
  if (payment <= 0 || principal <= 0) return 0;
  const rate = monthlyRate(annualRate);
  if (Math.abs(rate) < 0.0000001) return principal / payment / 12;
  if (payment <= principal * rate) return Number.NaN;
  const months = -Math.log(1 - (principal * rate) / payment) / Math.log(1 + rate);
  return months / 12;
}

function mortgageRate(payment, principal, years) {
  const months = years * 12;
  if (payment <= 0 || principal <= 0 || months <= 0) return 0;
  const zeroRatePayment = principal / months;
  if (payment < zeroRatePayment) return Number.NaN;
  if (Math.abs(payment - zeroRatePayment) < 0.01) return 0;

  let low = 0;
  let high = 100;
  for (let index = 0; index < 80; index += 1) {
    const mid = (low + high) / 2;
    const candidate = mortgagePayment(principal, mid, years);
    if (candidate < payment) low = mid;
    else high = mid;
  }

  return (low + high) / 2;
}

function rawMortgageValues() {
  return Object.fromEntries(
    mortgageFieldIds.map((id) => {
      const value = inputs[id].value.trim();
      return [id, value === "" ? null : Number.parseFloat(value)];
    }),
  );
}

function setMortgageInput(id, value) {
  if (!Number.isFinite(value) || value < 0) return;
  const decimals = id === "mortgageRate" || id === "mortgageYears" ? 2 : 0;
  inputs[id].value = formatInputNumber(value, decimals);
}

function syncMortgageFields() {
  const values = rawMortgageValues();
  const emptyFields = mortgageFieldIds.filter((id) => values[id] === null);
  if (emptyFields.length !== 1) return;

  const missing = emptyFields[0];
  const principal = values.mortgagePrincipal;
  const rate = values.mortgageRate;
  const payment = values.mortgageMonthly;
  const years = values.mortgageYears;
  let computed = Number.NaN;

  if (missing === "mortgageMonthly" && principal > 0 && rate >= 0 && years > 0) {
    computed = mortgagePayment(principal, rate, years);
  }

  if (missing === "mortgagePrincipal" && payment > 0 && rate >= 0 && years > 0) {
    computed = mortgagePrincipal(payment, rate, years);
  }

  if (missing === "mortgageYears" && payment > 0 && principal > 0 && rate >= 0) {
    computed = mortgageYears(payment, principal, rate);
  }

  if (missing === "mortgageRate" && payment > 0 && principal > 0 && years > 0) {
    computed = mortgageRate(payment, principal, years);
  }

  setMortgageInput(missing, computed);
}

function childLabel(index, total) {
  return total > 1 ? `第 ${index + 1} 个孩子` : "孩子";
}

function renderIncomeSteps() {
  if (!incomeSteps.length) {
    incomeStepList.innerHTML = '<p class="empty-note">未设置收入变化，默认使用起始每月税后收入。</p>';
    return;
  }

  incomeStepList.innerHTML = incomeSteps
    .map(
      (step, index) => `
        <div class="dynamic-row" data-income-step-row>
          <label>
            <span>变化年龄</span>
            <input data-income-age type="number" min="0" max="130" step="1" value="${step.age}" />
          </label>
          <label>
            <span>变更后月收入</span>
            <input data-income-amount type="number" min="0" step="100" value="${step.income}" />
          </label>
          <button class="row-button" type="button" data-remove-income-step="${index}">删除</button>
        </div>
      `,
    )
    .join("");
}

function renderChildBirthRows() {
  const count = clamp(Math.floor(numberValue("childCount")), 0, 8);
  childBirthAges = normalizeChildBirthAges(childBirthAges, count, inputs.childAge?.value ?? DEFAULTS.childAge);
  if (inputs.childAge) inputs.childAge.value = childBirthAges[0] ?? DEFAULTS.childAge;

  if (count === 0) {
    childBirthList.innerHTML = '<p class="empty-note">孩子数量为 0 时，不会产生养育相关现金流。</p>';
    return;
  }

  childBirthList.innerHTML = childBirthAges
    .map(
      (age, index) => `
        <div class="dynamic-row child-row">
          <label>
            <span>${childLabel(index, count)}出生时你的年龄</span>
            <input data-child-birth-age type="number" min="0" max="130" step="1" value="${age}" />
          </label>
        </div>
      `,
    )
    .join("");
}

function buildLifeModel(params) {
  const totalLifeMonths = Math.max(0, Math.round((params.deathAge - params.startAge) * 12));
  const margin = 1 + params.safetyMargin / 100;
  const activeChildAges = params.enableChildren
    ? normalizeChildBirthAges(params.childBirthAges, params.childCount, params.childAge)
    : [];
  const children = activeChildAges.map((birthAge, index) => ({
    index,
    birthAge,
    birthMonth: ageToMonth(birthAge, params),
    supportEndAge: birthAge + params.childSupportYears,
    supportEndMonth: ageToMonth(birthAge + params.childSupportYears, params),
    educationAge: birthAge + params.educationAge,
    educationMonth: ageToMonth(birthAge + params.educationAge, params),
    giftAge: birthAge + params.childMarriageGiftAge,
    giftMonth: ageToMonth(birthAge + params.childMarriageGiftAge, params),
  }));
  const oneTimeEvents = [];
  const timeline = [];
  const chartEvents = [];

  function addChartEvent(name, age, category) {
    const month = ageToMonth(age, params);
    if (!inLife(month, totalLifeMonths)) return;
    chartEvents.push({ name, age, month, category });
  }

  function addTimelineEvent(name, age, text, category, extra = {}) {
    const month = ageToMonth(age, params);
    if (!inLife(month, totalLifeMonths)) return;
    timeline.push({ name, age, text, category, ...extra });
    addChartEvent(name, age, category);
  }

  function addOneTime(name, age, amount, category) {
    const month = ageToMonth(age, params);
    if (amount <= 0 || !inLife(month, totalLifeMonths)) return;
    const adjustedAmount = amount * margin;
    oneTimeEvents.push({ name, month, age, amount: adjustedAmount, category });
    addTimelineEvent(name, age, formatCurrency(adjustedAmount), category, { amount: adjustedAmount });
  }

  if (params.enableHome) {
    addOneTime("买房首付", params.homeAge, params.homeDownPayment, "置业");
    if (params.mortgageMonthly > 0 && params.mortgageYears > 0) {
      addTimelineEvent("房贷开始", params.homeAge, `${formatCurrency(params.mortgageMonthly)} / 月`, "置业");
      addTimelineEvent("房贷结束", params.homeAge + params.mortgageYears, "月供结束", "置业");
    }
    if (params.homeMaintenanceMonthly > 0) {
      addTimelineEvent("物业维护开始", params.homeAge, `${formatCurrency(params.homeMaintenanceMonthly)} / 月`, "置业");
    }
  }

  if (params.enableMarriage) {
    addOneTime("结婚安家", params.marriageAge, params.weddingCost, "家庭");
    if (params.spouseContribution > 0) {
      addTimelineEvent(
        "伴侣分担",
        params.marriageAge,
        `+${formatCurrency(params.spouseContribution)} / 月`,
        "家庭",
      );
    }
  }

  if (params.enableChildren && children.length > 0) {
    children.forEach((child) => {
      const label = childLabel(child.index, children.length);
      addOneTime(`${label}出生支出`, child.birthAge, params.birthCost, "养育");
      if (params.childMonthlyCost > 0 && params.childSupportYears > 0) {
        addTimelineEvent(`${label}养育开始`, child.birthAge, `${formatCurrency(params.childMonthlyCost)} / 月`, "养育");
        addTimelineEvent(`${label}养育结束`, child.supportEndAge, "月支出结束", "养育");
      }
      addOneTime(`${label}教育储备`, child.educationAge, params.educationCost, "养育");
      addOneTime(`${label}彩礼/婚嫁支持`, child.giftAge, params.childMarriageGift, "养育");
    });
  }

  if (params.enableParents) {
    if (params.parentMonthlySupport > 0) {
      addTimelineEvent(
        "父母赡养开始",
        params.parentSupportStartAge,
        `${formatCurrency(params.parentMonthlySupport)} / 月`,
        "赡养",
      );
      if (params.parentSupportEndAge > params.parentSupportStartAge) {
        addTimelineEvent("父母赡养结束", params.parentSupportEndAge, "月支出结束", "赡养");
      }
    }
    addOneTime("父母应急储备", params.parentEmergencyAge, params.parentEmergencyFund, "赡养");
  }

  if (params.enableMedicalReserve && params.medicalReserve > 0 && params.medicalReserveAge <= params.deathAge) {
    const reserveAge = Math.max(params.medicalReserveAge, params.startAge);
    addTimelineEvent(
      "养老储备金",
      reserveAge,
      `${formatCurrency(params.medicalReserve * margin)} 保护性余额`,
      "养老",
      {
        amount: params.medicalReserve * margin,
        protected: true,
      },
    );
  }

  if (params.enableElderlyMedicalMonthly && params.elderlyMedicalMonthly > 0) {
    addTimelineEvent(
      "养老月预算开始",
      params.elderlyMedicalStartAge,
      `${formatCurrency(params.elderlyMedicalMonthly)} / 月`,
      "养老",
    );
  }

  sanitizeIncomeSteps(params.incomeSteps).forEach((step) => {
    addTimelineEvent("收入阶段", step.age, `个人月收入变为 ${formatCurrency(step.income)}`, "收入");
  });

  const marriageMonth = params.enableMarriage ? ageToMonth(params.marriageAge, params) : Number.POSITIVE_INFINITY;
  const homeMonth = params.enableHome ? ageToMonth(params.homeAge, params) : Number.POSITIVE_INFINITY;
  const mortgageEndMonth = homeMonth + Math.round(params.mortgageYears * 12);
  const parentSupportStartMonth = params.enableParents
    ? ageToMonth(params.parentSupportStartAge, params)
    : Number.POSITIVE_INFINITY;
  const parentSupportEndMonth = params.enableParents
    ? ageToMonth(params.parentSupportEndAge, params)
    : Number.POSITIVE_INFINITY;
  const medicalStartMonth = params.enableElderlyMedicalMonthly
    ? ageToMonth(params.elderlyMedicalStartAge, params)
    : Number.POSITIVE_INFINITY;
  const reserveMonth = params.enableMedicalReserve
    ? ageToMonth(params.medicalReserveAge, params)
    : Number.POSITIVE_INFINITY;

  oneTimeEvents.sort((a, b) => a.month - b.month);
  timeline.sort((a, b) => a.age - b.age);
  chartEvents.sort((a, b) => a.month - b.month);

  return {
    totalLifeMonths,
    margin,
    childCount: children.length,
    children,
    oneTimeEvents,
    timeline,
    chartEvents,
    incomeSteps: sanitizeIncomeSteps(params.incomeSteps),
    marriageMonth,
    homeMonth,
    mortgageEndMonth,
    parentSupportStartMonth,
    parentSupportEndMonth,
    medicalStartMonth,
    reserveMonth,
  };
}

function oneTimeExpenseAt(month, model) {
  return model.oneTimeEvents
    .filter((event) => event.month === month)
    .reduce((total, event) => total + event.amount, 0);
}

function futureEventExpenseAt(month, currentMonth, model) {
  if (month <= currentMonth) return 0;
  return oneTimeExpenseAt(month, model);
}

function monthlyExpenseFor(month, params, model) {
  let expense = params.monthlyExpense;

  if (month >= model.homeMonth) {
    expense += params.homeMaintenanceMonthly;
  }

  if (month >= model.homeMonth && month < model.mortgageEndMonth) {
    expense += params.mortgageMonthly;
  }

  const activeChildren = model.children.filter(
    (child) => month >= child.birthMonth && month < child.supportEndMonth,
  ).length;
  expense += params.childMonthlyCost * activeChildren;

  if (month >= model.parentSupportStartMonth && month < model.parentSupportEndMonth) {
    expense += params.parentMonthlySupport;
  }

  if (month >= model.medicalStartMonth) {
    expense += params.elderlyMedicalMonthly;
  }

  return Math.max(0, expense * model.margin);
}

function monthlyIncomeFor(month, phase, params, model) {
  if (phase === "retire") {
    return params.passiveIncome;
  }

  let income = params.monthlyIncome;
  model.incomeSteps.forEach((step) => {
    if (month >= ageToMonth(step.age, params)) {
      income = step.income;
    }
  });

  if (month >= model.marriageMonth) {
    income += params.spouseContribution;
  }

  return Math.max(0, income);
}

function protectedReserveValue(currentMonth, retireRate, params, model) {
  if (!params.enableMedicalReserve || params.medicalReserve <= 0 || params.medicalReserveAge > params.deathAge) {
    return 0;
  }

  const reserve = params.medicalReserve * model.margin;
  const reserveMonth = Math.max(0, model.reserveMonth);
  if (currentMonth >= reserveMonth) return reserve;

  return reserve / Math.pow(1 + retireRate, reserveMonth - currentMonth);
}

function requiredCapitalAt(currentMonth, params, model, retireRate) {
  let needed = params.legacyGoal * model.margin;

  for (let month = model.totalLifeMonths - 1; month >= currentMonth; month -= 1) {
    const netExpense = monthlyExpenseFor(month, params, model) - monthlyIncomeFor(month, "retire", params, model);
    needed = (needed + netExpense) / (1 + retireRate);
    needed += futureEventExpenseAt(month, currentMonth, model);
  }

  needed += params.oneTimeGoal * model.margin;
  needed += protectedReserveValue(currentMonth, retireRate, params, model);

  return Math.max(0, needed);
}

function findRetirementMonth(params, model, workRate, retireRate) {
  let assets = params.initialAssets;
  const workingSeries = [];

  for (let month = 0; month <= model.totalLifeMonths; month += 1) {
    assets -= oneTimeExpenseAt(month, model);
    const required = requiredCapitalAt(month, params, model, retireRate);
    workingSeries.push({ month, assets, required });

    if (assets >= required) {
      return {
        success: true,
        retirementMonth: month,
        retirementAssets: assets,
        requiredAtRetirement: required,
        workingSeries,
      };
    }

    if (month < model.totalLifeMonths) {
      const income = monthlyIncomeFor(month, "work", params, model);
      const expense = monthlyExpenseFor(month, params, model);
      assets = assets * (1 + workRate) + income - expense;
    }
  }

  const last = workingSeries[workingSeries.length - 1];
  return {
    success: false,
    retirementMonth: null,
    retirementAssets: last ? last.assets : params.initialAssets,
    requiredAtRetirement: last ? last.required : 0,
    workingSeries,
  };
}

function buildProjection(params, model, retireMonth, workRate, retireRate) {
  let assets = params.initialAssets;
  const series = [];
  const targetSeries = [];
  let totalIncome = 0;
  let totalExpense = 0;
  let eventExpense = 0;
  let peakOutflow = 0;
  const pressureBands = new Map();
  let bankruptcyMonth = null;

  function flagBankruptcy(month) {
    if (bankruptcyMonth === null && assets < 0) {
      bankruptcyMonth = clamp(month, 0, model.totalLifeMonths);
    }
  }

  for (let month = 0; month <= model.totalLifeMonths; month += 1) {
    const eventsNow = oneTimeExpenseAt(month, model);
    assets -= eventsNow;
    flagBankruptcy(month);
    eventExpense += eventsNow;

    const required = requiredCapitalAt(month, params, model, retireRate);
    series.push({ month, assets });
    targetSeries.push({ month, required });

    if (month < model.totalLifeMonths) {
      const phase = month < retireMonth ? "work" : "retire";
      const rate = phase === "work" ? workRate : retireRate;
      const income = monthlyIncomeFor(month, phase, params, model);
      const expense = monthlyExpenseFor(month, params, model);
      const outflow = expense + eventsNow;
      const bandStart = Math.floor(monthToAge(month, params) / 10) * 10;

      totalIncome += income;
      totalExpense += outflow;
      peakOutflow = Math.max(peakOutflow, outflow);
      pressureBands.set(bandStart, (pressureBands.get(bandStart) || 0) + outflow);
      assets = assets * (1 + rate) + income - expense;
      flagBankruptcy(month + 1);
    } else {
      totalExpense += eventsNow;
      peakOutflow = Math.max(peakOutflow, eventsNow);
      if (eventsNow > 0) {
        const bandStart = Math.floor(monthToAge(month, params) / 10) * 10;
        pressureBands.set(bandStart, (pressureBands.get(bandStart) || 0) + eventsNow);
      }
    }
  }

  let pressureBandStart = Math.floor(params.startAge / 10) * 10;
  let pressureBandExpense = 0;
  pressureBands.forEach((amount, bandStart) => {
    if (amount > pressureBandExpense) {
      pressureBandExpense = amount;
      pressureBandStart = bandStart;
    }
  });

  return {
    series,
    targetSeries,
    totalIncome,
    totalExpense,
    eventExpense,
    peakOutflow,
    pressureBandStart,
    pressureBandExpense,
    bankruptcyMonth,
  };
}

function runProjection(params) {
  const model = buildLifeModel(params);
  const workRate = monthlyRate(params.workReturn);
  const retireRate = monthlyRate(params.retireReturn);
  const found = findRetirementMonth(params, model, workRate, retireRate);
  const retireMonth = found.success ? found.retirementMonth : model.totalLifeMonths;
  const projection = buildProjection(params, model, retireMonth, workRate, retireRate);
  const retireAge = params.startAge + retireMonth / 12;

  return {
    ...found,
    ...projection,
    model,
    retireMonth,
    retireAge,
    bankruptcyAge:
      projection.bankruptcyMonth === null ? null : params.startAge + projection.bankruptcyMonth / 12,
    workShare: model.totalLifeMonths > 0 ? retireMonth / model.totalLifeMonths : 0,
    baseMonthlySurplus: params.monthlyIncome - params.monthlyExpense * model.margin,
    medicalReserve: protectedReserveValue(retireMonth, retireRate, params, model),
    medicalReserveNominal:
      params.enableMedicalReserve && params.medicalReserve > 0 && params.medicalReserveAge <= params.deathAge
        ? params.medicalReserve * model.margin
        : 0,
  };
}

function updateScenarioControls(params) {
  const scenarios = [
    { flag: "enableHome", selector: '[data-scenario="home"]' },
    { flag: "enableMarriage", selector: '[data-scenario="marriage"]' },
    { flag: "enableChildren", selector: '[data-scenario="children"]' },
    { flag: "enableParents", selector: '[data-scenario="parents"]' },
  ];

  scenarios.forEach(({ flag, selector }) => {
    const fieldset = document.querySelector(selector);
    if (!fieldset) return;
    const enabled = Boolean(params[flag]);
    fieldset.classList.toggle("scenario-disabled", !enabled);
    fieldset.querySelectorAll("input, button").forEach((input) => {
      if (input.id !== flag) input.disabled = !enabled;
    });
  });

  const medicalFieldset = document.querySelector('[data-scenario="medical"]');
  if (!medicalFieldset) return;

  const reserveEnabled = Boolean(params.enableMedicalReserve);
  const monthlyEnabled = Boolean(params.enableElderlyMedicalMonthly);
  medicalFieldset.classList.toggle("scenario-disabled", !reserveEnabled && !monthlyEnabled);

  medicalFieldset.querySelectorAll('[data-medical-group="reserve"]').forEach((label) => {
    label.classList.toggle("scenario-sub-disabled", !reserveEnabled);
    label.querySelectorAll("input").forEach((input) => {
      input.disabled = !reserveEnabled;
    });
  });

  medicalFieldset.querySelectorAll('[data-medical-group="monthly"]').forEach((label) => {
    label.classList.toggle("scenario-sub-disabled", !monthlyEnabled);
    label.querySelectorAll("input").forEach((input) => {
      input.disabled = !monthlyEnabled;
    });
  });
}

function validate(params) {
  if (params.startAge < 0 || params.deathAge <= params.startAge) {
    return "预计寿命年龄需要大于工作起始年龄";
  }
  if (params.workReturn <= -100 || params.retireReturn <= -100) {
    return "年化收益率需要高于 -100%";
  }
  if (params.mortgageRate < 0 || params.mortgageYears < 0 || params.childSupportYears < 0) {
    return "贷款利率和持续年数不能为负数";
  }
  if (params.educationAge < 0 || params.childMarriageGiftAge < 0) {
    return "孩子相关发生年龄不能为负数";
  }
  if (params.enableParents && params.parentSupportEndAge < params.parentSupportStartAge) {
    return "父母支出结束年龄需要大于或等于开始年龄";
  }
  if (params.incomeSteps.some((step) => step.age > params.deathAge)) {
    return "分段收入年龄需要在预计寿命之前";
  }
  return "";
}

function markBoardStale() {
  if (!boardGenerated) return;
  boardGenerated = false;
  output.boardPreview.hidden = true;
  output.boardStatus.textContent = "参数已变化，点击生成图片看板刷新预览。";
  output.downloadBoardLink.hidden = true;
}

function updateUI({ persist = true } = {}) {
  const params = readParams();
  markBoardStale();
  updateScenarioControls(params);
  if (persist) saveParams(params);
  const error = validate(params);

  if (error) {
    latestResult = null;
    output.statusCard.classList.add("warning");
    output.statusCard.classList.remove("bankrupt");
    output.statusBadge.textContent = "参数有误";
    output.workDuration.textContent = "--";
    output.retireAge.textContent = error;
    drawEmptyChart(error);
    output.eventTimeline.innerHTML = "";
    return;
  }

  const result = runProjection(params);
  latestResult = { params, result };
  const bankrupt = result.bankruptcyMonth !== null;

  output.statusCard.classList.toggle("warning", !result.success || bankrupt);
  output.statusCard.classList.toggle("bankrupt", bankrupt);

  if (bankrupt) {
    output.statusBadge.textContent = "破产风险";
    output.workDuration.textContent = "资产低于 0";
    output.retireAge.textContent = `约 ${trimNumber(result.bankruptcyAge)} 岁资金转负，当前方案需要先补足现金流。`;
  } else if (result.success) {
    output.statusBadge.textContent = result.retirementMonth === 0 ? "已达成" : "可达成";
    output.workDuration.textContent = formatDuration(result.retirementMonth);
    output.retireAge.textContent = `约 ${formatAge(params.startAge, result.retirementMonth)} 岁实现财务自由`;
  } else {
    output.statusBadge.textContent = "未达成";
    output.workDuration.textContent = "无法达成";
    output.retireAge.textContent = `到 ${params.deathAge} 岁仍不足以覆盖这些人生目标`;
  }

  output.requiredAssets.textContent = formatCurrency(result.requiredAtRetirement);
  output.retireAssets.textContent = formatPercent(result.workShare);
  output.monthlySurplus.textContent = formatCurrency(result.baseMonthlySurplus);
  output.peakOutflow.textContent = formatAgeBand(result.pressureBandStart);
  output.totalIncome.textContent = formatCurrency(result.totalIncome);
  output.totalExpense.textContent = formatCurrency(result.totalExpense);
  output.eventExpense.textContent = formatCurrency(result.eventExpense);
  output.medicalReserveDisplay.textContent = formatCurrency(result.medicalReserveNominal);

  renderTimeline(params, result);
  drawChart(params, result);
}

function timelineForResult(params, result) {
  const timeline = [
    { name: "开始工作", age: params.startAge, text: "起点", category: "基础" },
    ...result.model.timeline,
  ];

  if (result.bankruptcyMonth !== null) {
    timeline.push({
      name: "破产风险",
      age: result.bankruptcyAge,
      text: "资产低于 0",
      category: "风险",
    });
  }

  timeline.push({
    name: result.success ? "实现财务自由" : "仍需工作",
    age: result.retireAge,
    text: result.success ? "目标达成" : "未达成",
    category: result.success ? "结果" : "风险",
  });

  return timeline.sort((a, b) => a.age - b.age);
}

function renderTimeline(params, result) {
  const timeline = timelineForResult(params, result);

  output.eventTimeline.innerHTML = timeline
    .map(
      (event) => `
        <article class="timeline-item ${event.category === "风险" ? "risk" : ""}">
          <span class="event-age">${trimNumber(event.age)} 岁</span>
          <div>
            <strong>${event.name}</strong>
            <span>${event.text}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function drawEmptyChart(message) {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfefd";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#66736d";
  ctx.font = "24px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function drawChart(params, result) {
  const { width, height } = canvas;
  const pad = { top: 128, right: 28, bottom: 52, left: 78 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const assetSeries = visibleAssetSeries(result);
  const targetSeries = visibleTargetSeries(result);
  const allValues = [
    ...assetSeries.map((point) => point.assets),
    ...targetSeries.map((point) => point.required),
    0,
  ];
  const maxValue = Math.max(...allValues);
  const yMin = 0;
  const yMaxBase = Math.max(maxValue, 1);
  const yMax = yMaxBase * 1.14;

  const x = (month) => pad.left + (month / Math.max(1, result.model.totalLifeMonths)) * chartWidth;
  const y = (value) => pad.top + (1 - (value - yMin) / (yMax - yMin)) * chartHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfefd";
  ctx.fillRect(0, 0, width, height);

  drawGrid(width, height, pad, y, yMin, yMax, params, result, x);
  drawZeroBaseline(width, pad, y);
  drawLine(targetSeries, (point) => x(point.month), (point) => y(point.required), "#d49b2f", 3);
  drawLine(assetSeries, (point) => x(point.month), (point) => y(point.assets), "#0f766e", 4);
  drawEventMarkers(result, x, pad, height);

  if (result.success) {
    drawRetireMarker(result.retirementMonth, x, pad, height);
  }

  if (result.bankruptcyMonth !== null) {
    drawBankruptcyMarker(result.bankruptcyMonth, x, pad, height);
  }
}

function drawGrid(width, height, pad, y, yMin, yMax, params, result, x) {
  ctx.save();
  ctx.strokeStyle = "#e4ece9";
  ctx.fillStyle = "#66736d";
  ctx.lineWidth = 1;
  ctx.font = "14px Microsoft YaHei, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let index = 0; index <= 4; index += 1) {
    const value = yMin + ((yMax - yMin) * index) / 4;
    const py = y(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(width - pad.right, py);
    ctx.stroke();
    ctx.fillText(formatCurrency(value), pad.left - 10, py);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let index = 0; index <= 5; index += 1) {
    const month = (result.model.totalLifeMonths * index) / 5;
    const px = x(month);
    ctx.beginPath();
    ctx.moveTo(px, height - pad.bottom);
    ctx.lineTo(px, height - pad.bottom + 7);
    ctx.stroke();
    ctx.fillText(`${trimNumber(monthToAge(month, params))}岁`, px, height - pad.bottom + 12);
  }

  ctx.restore();
}

function drawZeroBaseline(width, pad, y) {
  ctx.save();
  ctx.strokeStyle = "rgba(24, 33, 31, 0.34)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(pad.left, y(0));
  ctx.lineTo(width - pad.right, y(0));
  ctx.stroke();
  ctx.restore();
}

function drawLine(points, xGetter, yGetter, color, lineWidth) {
  if (!points.length) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  points.forEach((point, index) => {
    const px = xGetter(point);
    const py = yGetter(point);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });

  ctx.stroke();
  ctx.restore();
}

function fitText(text, maxChars = 14) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

function drawEventMarkers(result, x, pad, height) {
  const groupedEvents = [];
  const byMonth = new Map();
  const horizon = chartHorizonMonth(result);

  result.model.chartEvents.forEach((event) => {
    if (event.month > horizon) return;
    if (!byMonth.has(event.month)) byMonth.set(event.month, []);
    byMonth.get(event.month).push(event);
  });

  byMonth.forEach((events, month) => {
    groupedEvents.push({
      month,
      name: compactEventLabel(events),
      category: events[0].category,
    });
  });

  groupedEvents.sort((a, b) => a.month - b.month);

  ctx.save();
  ctx.strokeStyle = "rgba(50, 103, 168, 0.22)";
  ctx.fillStyle = "#3267a8";
  ctx.font = "12px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const levels = Array(4).fill(-Number.MAX_VALUE);
  groupedEvents.forEach((event) => {
    const px = x(event.month);
    let level = levels.findIndex((lastX) => px - lastX > 104);
    if (level === -1) {
      level = levels.indexOf(Math.min(...levels));
    }
    levels[level] = px;

    const label = fitText(event.name, 10);
    const labelWidth = Math.min(112, ctx.measureText(label).width + 14);
    const labelX = clamp(px, pad.left + labelWidth / 2, canvas.width - pad.right - labelWidth / 2);
    const labelY = pad.top - 68 + level * 18;

    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(px, labelY + 10);
    ctx.lineTo(px, height - pad.bottom);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(251, 254, 253, 0.92)";
    ctx.strokeStyle = "rgba(50, 103, 168, 0.22)";
    ctx.fillRect(labelX - labelWidth / 2, labelY - 8, labelWidth, 16);
    ctx.strokeRect(labelX - labelWidth / 2, labelY - 8, labelWidth, 16);
    ctx.fillStyle = event.category === "收入" ? "#0f766e" : "#3267a8";
    ctx.fillText(label, labelX, labelY);
    ctx.strokeStyle = "rgba(50, 103, 168, 0.22)";
  });

  ctx.restore();
}

function drawRetireMarker(retirementMonth, x, pad, height) {
  const markerX = x(retirementMonth);
  ctx.save();
  ctx.strokeStyle = "rgba(11, 79, 74, 0.56)";
  ctx.setLineDash([7, 7]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(markerX, pad.top);
  ctx.lineTo(markerX, height - pad.bottom);
  ctx.stroke();
  ctx.fillStyle = "#0b4f4a";
  ctx.font = "700 18px Microsoft YaHei, sans-serif";
  ctx.textAlign = markerX > canvas.width - 180 ? "right" : "left";
  ctx.fillText("财务自由点", markerX + (markerX > canvas.width - 180 ? -10 : 10), pad.top + 25);
  ctx.restore();
}

function drawBankruptcyMarker(bankruptcyMonth, x, pad, height) {
  const markerX = x(bankruptcyMonth);
  ctx.save();
  ctx.strokeStyle = "rgba(196, 73, 73, 0.68)";
  ctx.setLineDash([5, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(markerX, pad.top);
  ctx.lineTo(markerX, height - pad.bottom);
  ctx.stroke();
  ctx.fillStyle = "#c44949";
  ctx.font = "700 16px Microsoft YaHei, sans-serif";
  ctx.textAlign = markerX > canvas.width - 160 ? "right" : "left";
  ctx.fillText("破产风险", markerX + (markerX > canvas.width - 160 ? -10 : 10), pad.top + 50);
  ctx.restore();
}

function boardTone(params, result) {
  if (result.bankruptcyMonth !== null) {
    return {
      badge: "破产风险",
      headline: `约 ${trimNumber(result.bankruptcyAge)} 岁资产转负`,
      detail: "当前规划会在某个时点跌破 0，需要先补足现金流或调整人生事件预算。",
      accent: "#c44949",
      soft: "#fff2ef",
    };
  }

  if (result.success) {
    return {
      badge: result.retirementMonth === 0 ? "已达成" : "可达成",
      headline: `约 ${formatAge(params.startAge, result.retirementMonth)} 岁实现财务自由`,
      detail: `还需要工作 ${formatDuration(result.retirementMonth)}，退休时预计资产 ${formatCurrency(
        result.retirementAssets,
      )}。`,
      accent: "#0f766e",
      soft: "#e4f5ef",
    };
  }

  return {
    badge: "未达成",
    headline: "当前目标无法覆盖",
    detail: `工作到 ${params.deathAge} 岁仍不足以覆盖当前输入的人生目标。`,
    accent: "#d49b2f",
    soft: "#fff7e7",
  };
}

function boardRoundRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fillBoardRect(context, x, y, width, height, radius, fill, stroke = "") {
  boardRoundRect(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  }
}

function drawBoardText(context, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const lines = [];
  let current = "";

  Array.from(String(text)).forEach((char) => {
    const next = current + char;
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1].slice(0, -1)}…`;
  }

  visibleLines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });

  return y + visibleLines.length * lineHeight;
}

function drawBoardMetric(context, x, y, width, height, label, value, accent = "#0f766e") {
  fillBoardRect(context, x, y, width, height, 18, "#ffffff", "#dfe8e5");
  context.fillStyle = "#66736d";
  context.font = '700 28px "Microsoft YaHei", sans-serif';
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(label, x + 28, y + 24);
  context.fillStyle = accent;
  context.font = '900 44px "Microsoft YaHei", sans-serif';
  drawBoardText(context, value, x + 28, y + 68, width - 56, 48, 2);
}

function drawBoardLine(context, points, xGetter, yGetter, color, lineWidth) {
  if (!points.length) return;

  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();

  points.forEach((point, index) => {
    const px = xGetter(point);
    const py = yGetter(point);
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });

  context.stroke();
  context.restore();
}

function drawBoardChart(context, params, result, x, y, width, height) {
  fillBoardRect(context, x, y, width, height, 20, "#ffffff", "#dfe8e5");

  const pad = { top: 72, right: 46, bottom: 62, left: 126 };
  const chartX = x + pad.left;
  const chartY = y + pad.top;
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const assetSeries = visibleAssetSeries(result);
  const targetSeries = visibleTargetSeries(result);
  const values = [
    ...assetSeries.map((point) => point.assets),
    ...targetSeries.map((point) => point.required),
    0,
  ];
  const maxValue = Math.max(...values, 1);
  const yMin = 0;
  const yMax = maxValue * 1.14;
  const xScale = (month) => chartX + (month / Math.max(1, result.model.totalLifeMonths)) * chartWidth;
  const yScale = (value) => chartY + (1 - (value - yMin) / (yMax - yMin)) * chartHeight;

  context.fillStyle = "#18211f";
  context.font = '900 34px "Microsoft YaHei", sans-serif';
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText("资产轨迹", x + 32, y + 26);

  context.font = '700 22px "Microsoft YaHei", sans-serif';
  context.fillStyle = "#66736d";
  context.fillText("预计资产与退休门槛", x + 190, y + 33);

  context.save();
  context.strokeStyle = "#e4ece9";
  context.fillStyle = "#66736d";
  context.lineWidth = 2;
  context.font = '700 21px "Microsoft YaHei", sans-serif';
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let index = 0; index <= 4; index += 1) {
    const value = yMin + ((yMax - yMin) * index) / 4;
    const py = yScale(value);
    context.beginPath();
    context.moveTo(chartX, py);
    context.lineTo(chartX + chartWidth, py);
    context.stroke();
    context.fillText(formatCurrency(value), chartX - 16, py);
  }

  const zeroY = yScale(0);
  context.strokeStyle = "rgba(24, 33, 31, 0.38)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(chartX, zeroY);
  context.lineTo(chartX + chartWidth, zeroY);
  context.stroke();

  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillStyle = "#66736d";
  for (let index = 0; index <= 5; index += 1) {
    const month = (result.model.totalLifeMonths * index) / 5;
    context.fillText(`${trimNumber(monthToAge(month, params))}岁`, xScale(month), chartY + chartHeight + 24);
  }
  context.restore();

  drawBoardLine(
    context,
    targetSeries,
    (point) => xScale(point.month),
    (point) => yScale(point.required),
    "#d49b2f",
    6,
  );
  drawBoardLine(
    context,
    assetSeries,
    (point) => xScale(point.month),
    (point) => yScale(point.assets),
    "#0f766e",
    7,
  );

  if (result.success) {
    const markerX = xScale(result.retirementMonth);
    context.save();
    context.strokeStyle = "rgba(15, 118, 110, 0.45)";
    context.setLineDash([12, 12]);
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(markerX, chartY);
    context.lineTo(markerX, chartY + chartHeight);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#0b4f4a";
    context.font = '900 24px "Microsoft YaHei", sans-serif';
    context.textAlign = markerX > x + width - 250 ? "right" : "left";
    context.fillText("财务自由点", markerX + (markerX > x + width - 250 ? -16 : 16), chartY + 18);
    context.restore();
  }

  if (result.bankruptcyMonth !== null) {
    const markerX = xScale(result.bankruptcyMonth);
    context.save();
    context.strokeStyle = "rgba(196, 73, 73, 0.55)";
    context.setLineDash([10, 10]);
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(markerX, chartY);
    context.lineTo(markerX, chartY + chartHeight);
    context.stroke();
    context.fillStyle = "#c44949";
    context.font = '900 24px "Microsoft YaHei", sans-serif';
    context.textAlign = markerX > x + width - 220 ? "right" : "left";
    context.fillText("破产风险", markerX + (markerX > x + width - 220 ? -16 : 16), chartY + 54);
    context.restore();
  }

  context.fillStyle = "#0f766e";
  context.beginPath();
  context.arc(x + width - 300, y + 44, 8, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#66736d";
  context.font = '700 22px "Microsoft YaHei", sans-serif';
  context.fillText("预计资产", x + width - 282, y + 33);
  context.fillStyle = "#d49b2f";
  context.beginPath();
  context.arc(x + width - 146, y + 44, 8, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#66736d";
  context.fillText("退休门槛", x + width - 128, y + 33);
}

function drawBoardTimeline(context, timeline, x, y, width) {
  const columns = 2;
  const gap = 22;
  const cardWidth = (width - gap) / columns;
  const cardHeight = 104;

  context.fillStyle = "#18211f";
  context.font = '900 36px "Microsoft YaHei", sans-serif';
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText("关键人生节点", x, y);

  timeline.forEach((event, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cardX = x + column * (cardWidth + gap);
    const cardY = y + 70 + row * (cardHeight + 18);
    const risky = event.category === "风险";

    fillBoardRect(context, cardX, cardY, cardWidth, cardHeight, 16, risky ? "#fff8f7" : "#ffffff", risky ? "#f0cac5" : "#dfe8e5");

    context.fillStyle = risky ? "#c44949" : "#0f766e";
    context.font = '900 24px "Microsoft YaHei", sans-serif';
    context.fillText(`${trimNumber(event.age)} 岁`, cardX + 22, cardY + 22);

    context.fillStyle = "#18211f";
    context.font = '900 25px "Microsoft YaHei", sans-serif';
    drawBoardText(context, event.name, cardX + 128, cardY + 20, cardWidth - 150, 30, 1);

    context.fillStyle = "#66736d";
    context.font = '700 21px "Microsoft YaHei", sans-serif';
    drawBoardText(context, event.text, cardX + 128, cardY + 55, cardWidth - 150, 27, 2);
  });

  return y + 70 + Math.ceil(timeline.length / columns) * (cardHeight + 18);
}

function generateBoardImage() {
  if (!latestResult) {
    output.boardStatus.textContent = "当前参数有误，暂时无法生成图片看板。";
    return;
  }

  const { params, result } = latestResult;
  const tone = boardTone(params, result);
  const timeline = timelineForResult(params, result);
  const timelineRows = Math.ceil(timeline.length / 2);
  const width = 1600;
  const height = Math.max(1880, 1320 + timelineRows * 122 + 160);
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = width;
  exportCanvas.height = height;
  const boardCtx = exportCanvas.getContext("2d");

  boardCtx.fillStyle = "#eef3f1";
  boardCtx.fillRect(0, 0, width, height);
  boardCtx.fillStyle = "rgba(15, 118, 110, 0.10)";
  boardCtx.beginPath();
  boardCtx.arc(160, 150, 260, 0, Math.PI * 2);
  boardCtx.fill();
  boardCtx.fillStyle = "rgba(212, 155, 47, 0.12)";
  boardCtx.beginPath();
  boardCtx.arc(1450, 560, 320, 0, Math.PI * 2);
  boardCtx.fill();

  boardCtx.fillStyle = "#0b4f4a";
  boardCtx.font = '900 58px "Microsoft YaHei", sans-serif';
  boardCtx.textAlign = "left";
  boardCtx.textBaseline = "top";
  boardCtx.fillText("财务自由规划看板", 80, 66);

  boardCtx.fillStyle = "#66736d";
  boardCtx.font = '700 24px "Microsoft YaHei", sans-serif';
  boardCtx.fillText(`生成时间 ${new Date().toLocaleDateString("zh-CN")}`, 80, 136);

  fillBoardRect(boardCtx, 1220, 66, 300, 52, 26, "#fff8e7", "#f0d89c");
  boardCtx.fillStyle = "#5d4211";
  boardCtx.font = '900 22px "Microsoft YaHei", sans-serif';
  boardCtx.textAlign = "center";
  boardCtx.fillText("所有金额不考虑通货膨胀", 1370, 82);

  fillBoardRect(boardCtx, 80, 220, 1440, 250, 24, tone.soft, "#dfe8e5");
  boardCtx.fillStyle = tone.accent;
  boardCtx.font = '900 30px "Microsoft YaHei", sans-serif';
  boardCtx.textAlign = "left";
  boardCtx.fillText(tone.badge, 122, 260);
  boardCtx.fillStyle = "#18211f";
  boardCtx.font = '900 58px "Microsoft YaHei", sans-serif';
  drawBoardText(boardCtx, tone.headline, 122, 308, 900, 66, 2);
  boardCtx.fillStyle = "#66736d";
  boardCtx.font = '700 26px "Microsoft YaHei", sans-serif';
  drawBoardText(boardCtx, tone.detail, 122, 400, 920, 34, 2);
  boardCtx.fillStyle = tone.accent;
  boardCtx.font = '900 76px "Microsoft YaHei", sans-serif';
  boardCtx.textAlign = "right";
  boardCtx.fillText(result.bankruptcyMonth !== null ? "风险" : formatDuration(result.retireMonth), 1470, 288);
  boardCtx.fillStyle = "#66736d";
  boardCtx.font = '800 24px "Microsoft YaHei", sans-serif';
  boardCtx.fillText(result.bankruptcyMonth !== null ? "优先处理现金流" : "需要工作时间", 1470, 382);

  const metricY = 510;
  const metricGap = 20;
  const metricWidth = (1440 - metricGap * 3) / 4;
  drawBoardMetric(boardCtx, 80, metricY, metricWidth, 150, "基础月结余", formatCurrency(result.baseMonthlySurplus), result.baseMonthlySurplus < 0 ? "#c44949" : "#0f766e");
  drawBoardMetric(boardCtx, 80 + (metricWidth + metricGap), metricY, metricWidth, 150, "财务自由预计资产", formatCurrency(result.requiredAtRetirement), "#d49b2f");
  drawBoardMetric(boardCtx, 80 + (metricWidth + metricGap) * 2, metricY, metricWidth, 150, "工作在人生占比", formatPercent(result.workShare), tone.accent);
  drawBoardMetric(boardCtx, 80 + (metricWidth + metricGap) * 3, metricY, metricWidth, 150, "最高压力年龄段", formatAgeBand(result.pressureBandStart), "#3267a8");

  drawBoardChart(boardCtx, params, result, 80, 700, 1440, 520);

  drawBoardTimeline(boardCtx, timeline, 80, 1270, 1440);

  const dataUrl = exportCanvas.toDataURL("image/png");
  output.boardPreview.hidden = true;
  output.boardPreview.onload = () => {
    output.boardPreview.hidden = false;
    output.boardStatus.textContent = "图片看板已生成，可在下方预览或下载 PNG。";
  };
  output.boardPreview.onerror = () => {
    output.boardPreview.hidden = true;
    output.boardStatus.textContent = "图片看板已生成，可点击下载 PNG。";
  };
  output.boardPreview.src = dataUrl;
  output.downloadBoardLink.href = dataUrl;
  output.downloadBoardLink.download = `financial-dashboard-${Date.now()}.png`;
  output.downloadBoardLink.hidden = false;
  output.boardStatus.textContent = "正在生成预览...";
  boardGenerated = true;
}

function handleStaticInput(event) {
  const id = event.currentTarget.id;
  if (mortgageFieldIds.includes(id)) {
    syncMortgageFields();
  }
  if (id === "childCount") {
    childBirthAges = normalizeChildBirthAges(childBirthAges, numberValue("childCount"), inputs.childAge?.value);
    renderChildBirthRows();
  }
  updateUI();
}

ids.forEach((id) => {
  const input = inputs[id];
  if (!input || input.type === "hidden") return;
  const eventName = input.type === "checkbox" ? "change" : "input";
  input.addEventListener(eventName, handleStaticInput);
});

incomeStepList.addEventListener("input", () => {
  incomeSteps = readIncomeStepRows();
  updateUI();
});

incomeStepList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-income-step]");
  if (!removeButton) return;
  const index = Number.parseInt(removeButton.dataset.removeIncomeStep, 10);
  incomeSteps = readIncomeStepRows().filter((_, stepIndex) => stepIndex !== index);
  renderIncomeSteps();
  updateUI();
});

addIncomeStepButton.addEventListener("click", () => {
  incomeSteps = readIncomeStepRows();
  const lastStep = incomeSteps[incomeSteps.length - 1];
  const startAge = numberValue("startAge");
  incomeSteps.push({
    age: lastStep ? lastStep.age + 5 : startAge + 5,
    income: lastStep ? lastStep.income : numberValue("monthlyIncome"),
  });
  renderIncomeSteps();
  updateUI();
});

childBirthList.addEventListener("input", () => {
  childBirthAges = readChildBirthRows(numberValue("childCount"), inputs.childAge?.value);
  if (inputs.childAge) inputs.childAge.value = childBirthAges[0] ?? DEFAULTS.childAge;
  updateUI();
});

document.getElementById("generateBoardButton").addEventListener("click", generateBoardImage);
presetMenuButton.addEventListener("click", () => {
  const nextOpen = presetPanel.hidden;
  setPresetPanelOpen(nextOpen);
  if (nextOpen) setPresetStatus("");
});
savePresetButton.addEventListener("click", saveCurrentPreset);
presetNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveCurrentPreset();
  }
});
presetList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-preset-action]");
  if (!button) return;
  const presets = readPresets();
  const preset = presets.find((item) => item.id === button.dataset.presetId);
  if (!preset) return;

  if (button.dataset.presetAction === "apply") {
    applyPreset(preset);
    return;
  }

  if (button.dataset.presetAction === "delete") {
    const nextPresets = presets.filter((item) => item.id !== preset.id);
    if (savePresets(nextPresets)) {
      renderPresets();
      setPresetStatus(`已删除「${preset.name}」。`);
    } else {
      setPresetStatus("浏览器无法写入本地存储，删除没有保存成功。");
    }
  }
});
document.addEventListener("click", (event) => {
  if (presetPanel.hidden || quickSettings.contains(event.target)) return;
  setPresetPanelOpen(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setPresetPanelOpen(false);
});
dismissInflationAlertButton.addEventListener("click", dismissInflationAlert);
appShell.addEventListener("scroll", scheduleMobileSnap, { passive: true });
appShell.addEventListener("touchend", snapMobilePage, { passive: true });
window.addEventListener("resize", () => {
  if (isMobilePager()) {
    snapMobilePage();
  } else {
    updateMobilePageIndicator();
  }
});

if (isInflationAlertDismissed() && inflationAlert) {
  inflationAlert.classList.add("is-hidden");
}

applyParams(readSavedParams());
renderIncomeSteps();
renderChildBirthRows();
updateUI({ persist: false });
appShell.scrollLeft = 0;
updateMobilePageIndicator();
