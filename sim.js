// 간단한 브라우저용 시뮬레이터 (test1.ts 로직을 JS로 옮김)

// ----- LTV 규칙 -----
const LTV_RULES = [
  // 투기 아님
  { isSpeculative: false, lifeFirst: false, priceMin: 0, priceMax: Infinity, ltv: 0.7, maxLoan: null },
  { isSpeculative: false, lifeFirst: true, priceMin: 0, priceMax: Infinity, ltv: 0.7, maxLoan: null },

  // 투기: 생애최초 70%이지만 구간별 cap 적용
  { isSpeculative: true, lifeFirst: true, priceMin: 0, priceMax: 1_500_000_000, ltv: 0.7, maxLoan: 600_000_000 },
  { isSpeculative: true, lifeFirst: true, priceMin: 1_500_000_000, priceMax: 2_500_000_000, ltv: 0.7, maxLoan: 400_000_000 },
  { isSpeculative: true, lifeFirst: true, priceMin: 2_500_000_000, priceMax: Infinity, ltv: 0.7, maxLoan: 200_000_000 },

  // 투기 + 비생애: 40% + 구간 cap
  { isSpeculative: true, lifeFirst: false, priceMin: 0, priceMax: 1_500_000_000, ltv: 0.4, maxLoan: 600_000_000 },
  { isSpeculative: true, lifeFirst: false, priceMin: 1_500_000_000, priceMax: 2_500_000_000, ltv: 0.4, maxLoan: 400_000_000 },
  { isSpeculative: true, lifeFirst: false, priceMin: 2_500_000_000, priceMax: Infinity, ltv: 0.4, maxLoan: 200_000_000 },
];

// ----- DSR 기본값 -----
const DSR_DEFAULTS = {
  ratio: 0.4,
  maxYears: 30,
  defaultYears: 30,
  baseInterest: 0.04,
  repaymentType: "원리금균등",
};

// ----- 중개보수 -----
const BROKERAGE_FEE_TABLE = [
  { type: "아파트", tradeType: "매매", priceMin: 0, priceMax: 50_000_000, rate: 0.006, cap: null },
  { type: "아파트", tradeType: "매매", priceMin: 50_000_000, priceMax: 200_000_000, rate: 0.005, cap: 800_000 },
  { type: "아파트", tradeType: "매매", priceMin: 200_000_000, priceMax: 900_000_000, rate: 0.004, cap: null },
  { type: "아파트", tradeType: "매매", priceMin: 900_000_000, priceMax: 1_200_000_000, rate: 0.005, cap: null },
  { type: "아파트", tradeType: "매매", priceMin: 1_200_000_000, priceMax: 1_500_000_000, rate: 0.006, cap: null },
  { type: "아파트", tradeType: "매매", priceMin: 1_500_000_000, priceMax: Infinity, rate: 0.007, cap: null },
];

// ----- 채권 (미정: 0 처리) -----
const BOND_TABLE = [];

// ----- 기타비용 -----
const OTHER_COST_DEFAULTS = {
  taxAndFees: 12_957_333,
  brokerage: 2_840_000,
  miscCost: 15_797_333,
};

// ----- 취득세 테이블 (test1.ts와 동일) -----
const midBracketRate = (price) => {
  const priceInHundredMillions = price / 100_000_000;
  const ratePercent = priceInHundredMillions * (2 / 3) - 3;
  return Math.max(0, ratePercent / 100);
};

const ACQ_TAX_RULES = [
  { homeCount: 1, isAdjusted: false, priceMin: 0, priceMax: 600_000_000, acquisitionRate: { kind: "flat", rate: 0.01 }, ruralRate: { basis: "price", rate: 0 }, eduRate: { basis: "price", rate: 0.001 } },
  { homeCount: 1, isAdjusted: false, priceMin: 600_000_000, priceMax: 900_000_000, acquisitionRate: { kind: "progressive", calc: midBracketRate }, ruralRate: { basis: "price", rate: 0.002, areaOver85Only: true }, eduRate: { basis: "acquisitionTax", rate: 0.1 } },
  { homeCount: 1, isAdjusted: false, priceMin: 900_000_000, priceMax: null, acquisitionRate: { kind: "flat", rate: 0.03 }, ruralRate: { basis: "price", rate: 0.006, areaOver85Only: true }, eduRate: { basis: "price", rate: 0.003 } },
  { homeCount: 1, isAdjusted: true, priceMin: 0, priceMax: null, acquisitionRate: { kind: "flat", rate: 0.08 }, ruralRate: { basis: "price", rate: 0.006, areaOver85Only: true }, eduRate: { basis: "price", rate: 0.004 } },
  { homeCount: 2, isAdjusted: false, priceMin: 0, priceMax: 600_000_000, acquisitionRate: { kind: "flat", rate: 0.01 }, ruralRate: { basis: "price", rate: 0 }, eduRate: { basis: "price", rate: 0.001 } },
  { homeCount: 2, isAdjusted: false, priceMin: 600_000_000, priceMax: 900_000_000, acquisitionRate: { kind: "progressive", calc: midBracketRate }, ruralRate: { basis: "price", rate: 0.002, areaOver85Only: true }, eduRate: { basis: "acquisitionTax", rate: 0.1 } },
  { homeCount: 2, isAdjusted: false, priceMin: 900_000_000, priceMax: null, acquisitionRate: { kind: "flat", rate: 0.03 }, ruralRate: { basis: "price", rate: 0.006, areaOver85Only: true }, eduRate: { basis: "price", rate: 0.003 } },
  { homeCount: 2, isAdjusted: true, priceMin: 0, priceMax: null, acquisitionRate: { kind: "flat", rate: 0.08 }, ruralRate: { basis: "price", rate: 0.006, areaOver85Only: true }, eduRate: { basis: "price", rate: 0.004 } },
  { homeCount: 3, isAdjusted: false, priceMin: 0, priceMax: null, acquisitionRate: { kind: "flat", rate: 0.08 }, ruralRate: { basis: "price", rate: 0.006, areaOver85Only: true }, eduRate: { basis: "price", rate: 0.004 } },
  { homeCount: 3, isAdjusted: true, priceMin: 0, priceMax: null, acquisitionRate: { kind: "flat", rate: 0.12 }, ruralRate: { basis: "price", rate: 0.01, areaOver85Only: true }, eduRate: { basis: "price", rate: 0.004 } },
  { homeCount: 4, isAdjusted: false, priceMin: 0, priceMax: null, acquisitionRate: { kind: "flat", rate: 0.12 }, ruralRate: { basis: "price", rate: 0.01, areaOver85Only: true }, eduRate: { basis: "price", rate: 0.004 } },
  { homeCount: 4, isAdjusted: true, priceMin: 0, priceMax: null, acquisitionRate: { kind: "flat", rate: 0.12 }, ruralRate: { basis: "price", rate: 0.01, areaOver85Only: true }, eduRate: { basis: "price", rate: 0.004 } },
];

function findRule(input) {
  const hc = input.homeCount >= 4 ? 4 : Math.max(1, Math.min(4, Math.round(input.homeCount)));
  return (
    ACQ_TAX_RULES.find((r) => input.price >= r.priceMin && (r.priceMax === null || input.price < r.priceMax) && r.homeCount === hc && r.isAdjusted === input.isAdjusted) || null
  );
}

function resolveAcquisitionRate(price, rate) {
  return rate.kind === "flat" ? rate.rate : rate.calc(price);
}

function computeComponent(base, comp, areaOver85) {
  if (!comp) return 0;
  if (comp.areaOver85Only && !areaOver85) return 0;
  return base * comp.rate;
}

function computeAcquisitionTaxes(input) {
  if (input.price <= 0) return { acquisitionTax: 0, ruralTax: 0, educationTax: 0, total: 0, matchedRule: null, effectiveAcquisitionRate: 0 };
  const rule = findRule(input);
  if (!rule) return { acquisitionTax: 0, ruralTax: 0, educationTax: 0, total: 0, matchedRule: null, effectiveAcquisitionRate: 0 };
  const acquisitionRate = resolveAcquisitionRate(input.price, rule.acquisitionRate);
  const acquisitionTax = input.price * acquisitionRate;
  const ruralTax = computeComponent(rule.ruralRate?.basis === "acquisitionTax" ? acquisitionTax : input.price, rule.ruralRate, input.areaOver85);
  const educationTax = computeComponent(rule.eduRate?.basis === "acquisitionTax" ? acquisitionTax : input.price, rule.eduRate, input.areaOver85);
  const total = acquisitionTax + ruralTax + educationTax;
  return { acquisitionTax, ruralTax, educationTax, total, matchedRule: rule, effectiveAcquisitionRate: acquisitionRate };
}

// ----- 규제 임시 판별 -----
function inferRegionPolicyFromAddress(address) {
  const trimmed = (address || "").trim();
  const isSeoul = trimmed.startsWith("서울");
  return { isSpeculative: isSeoul, isAdjusted: isSeoul };
}

// ----- 대출/상환 유틸 -----
function findLtvRule(price, isSpeculative, lifeFirst) {
  return (
    LTV_RULES.find((r) => r.isSpeculative === isSpeculative && r.lifeFirst === lifeFirst && price >= r.priceMin && price < r.priceMax) || null
  );
}

function computeLtvLimit(price, isSpeculative, lifeFirst) {
  const rule = findLtvRule(price, isSpeculative, lifeFirst);
  if (!rule) return { limit: 0, rule: null };
  const ltvAmt = price * rule.ltv;
  const capped = rule.maxLoan != null ? Math.min(ltvAmt, rule.maxLoan) : ltvAmt;
  return { limit: capped, rule };
}

function pmt(principal, annualRate, months) {
  if (months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  const denom = 1 - Math.pow(1 + r, -months);
  return (principal * r) / denom;
}

function invertAnnuity(maxMonthly, annualRate, months) {
  if (months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return maxMonthly * months;
  const denom = 1 - Math.pow(1 + r, -months);
  return (maxMonthly * denom) / r;
}

function invertPrincipalEqual(maxMonthly, annualRate, months) {
  if (months <= 0) return 0;
  const r = annualRate / 12;
  const a = 1 / months + r;
  if (a <= 0) return 0;
  return maxMonthly / a;
}

function invertInterestOnly(maxMonthly, annualRate) {
  const r = annualRate / 12;
  if (r === 0) return 0;
  return maxMonthly / r;
}

function computeDsrLimit(incomeAnnual, opts = {}) {
  const ratio = opts.ratio ?? DSR_DEFAULTS.ratio;
  const years = Math.min(opts.years ?? DSR_DEFAULTS.defaultYears, DSR_DEFAULTS.maxYears);
  const rate = opts.rate ?? DSR_DEFAULTS.baseInterest;
  const repayment = opts.repaymentType ?? DSR_DEFAULTS.repaymentType;
  const monthlyIncome = incomeAnnual / 12;
  const monthlyAllowance = monthlyIncome * ratio;
  const months = years * 12;
  let principal = 0;
  if (repayment === "원리금균등") principal = invertAnnuity(monthlyAllowance, rate, months);
  else if (repayment === "원금균등") principal = invertPrincipalEqual(monthlyAllowance, rate, months);
  else principal = invertInterestOnly(monthlyAllowance, rate);
  return { limit: Math.max(0, principal), monthlyAllowance };
}

function findBrokerageRule(type, tradeType, price) {
  return (
    BROKERAGE_FEE_TABLE.find((r) => r.type === type && r.tradeType === tradeType && price >= r.priceMin && (r.priceMax === null || price < r.priceMax)) || null
  );
}

function computeBrokerageAmount(type, tradeType, price) {
  const rule = findBrokerageRule(type, tradeType, price);
  if (!rule) return 0;
  const fee = price * rule.rate;
  return rule.cap != null ? Math.min(fee, rule.cap) : fee;
}

function computeBondAmount(price) {
  const rule = BOND_TABLE.find((r) => price >= r.priceMin && (r.priceMax === null || price < r.priceMax));
  if (!rule) return 0;
  const amt = price * rule.rate;
  return rule.cap != null ? Math.min(amt, rule.cap) : amt;
}

function computeMonthlyPayment(principal, annualRate, years, repaymentType) {
  const months = years * 12;
  if (principal <= 0 || months <= 0) return 0;
  if (repaymentType === "원리금균등") return pmt(principal, annualRate, months);
  if (repaymentType === "원금균등") {
    const r = annualRate / 12;
    return principal / months + principal * r;
  }
  const r = annualRate / 12;
  return principal * r;
}

function computeFormResult(form) {
  const region = inferRegionPolicyFromAddress(form.address);
  const { limit: ltvLimit } = computeLtvLimit(form.price, region.isSpeculative, form.lifeFirst);
  const dsr = computeDsrLimit(form.incomeAnnual, { years: form.years, rate: form.rate, repaymentType: form.repaymentType });
  const loanLimit = Math.min(ltvLimit, dsr.limit);
  const taxes = computeAcquisitionTaxes({ homeCount: form.homeCount, isAdjusted: region.isAdjusted, price: form.price, areaOver85: form.areaOver85 });
  const brokerage = computeBrokerageAmount(form.productType, form.tradeType, form.price);
  const bond = computeBondAmount(form.price);
  const otherMisc = OTHER_COST_DEFAULTS.miscCost;
  const totalAcquisition = taxes.total + brokerage + bond + otherMisc;
  const neededCash = form.price - loanLimit;
  const shortage = neededCash - form.equity;
  const repaymentType = form.repaymentType ?? DSR_DEFAULTS.repaymentType;
  const rate = form.rate ?? DSR_DEFAULTS.baseInterest;
  const years = form.years ?? DSR_DEFAULTS.defaultYears;
  const monthlyPayment = computeMonthlyPayment(loanLimit, rate, years, repaymentType);
  return { loanLimit, ltvLimit, dsrLimit: dsr.limit, monthlyPayment, taxes, brokerage, bond, otherMisc, totalAcquisition, neededCash, shortage };
}

// ----- UI -----
const formGrid = document.getElementById("form-grid");
const resultsEl = document.getElementById("results");
const errorEl = document.getElementById("error");

const commaFields = ["price", "incomeAnnual", "equity"];

const fields = [
  { key: "price", label: "매매가 (원)", type: "text", placeholder: "700,000,000" },
  { key: "incomeAnnual", label: "연소득 (원)", type: "text", placeholder: "60,000,000" },
  { key: "equity", label: "순자산 (원)", type: "text", placeholder: "200,000,000" },
  { key: "address", label: "주소", type: "text", placeholder: "서울시 강남구 ..." },
  { key: "homeCount", label: "매입 후 주택 수", type: "number", placeholder: "1" },
  { key: "lifeFirst", label: "생애최초 여부", type: "select", options: ["false", "true"], display: { false: "아니오", true: "예" } },
  { key: "areaOver85", label: "전용 85㎡ 초과", type: "select", options: ["false", "true"], display: { false: "이하", true: "초과" } },
  { key: "productType", label: "상품구분", type: "select", options: ["아파트", "오피스텔", "기타"] },
  { key: "tradeType", label: "거래유형", type: "select", options: ["매매", "임대차"] },
  { key: "years", label: "대출 만기 (년)", type: "number", placeholder: "30" },
  { key: "rate", label: "금리 (연, 소수)", type: "number", step: "0.001", placeholder: "0.04" },
  { key: "repaymentType", label: "상환방식", type: "select", options: ["원리금균등", "원금균등", "원금만기일시상환"] },
];

const inputs = {};

function parseNumberField(el) {
  const raw = (el.value || "").toString().replace(/,/g, "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatNumberField(el) {
  const n = parseNumberField(el);
  if (!el.value) {
    el.value = "";
  } else {
    el.value = n.toLocaleString("ko-KR");
  }
  return n;
}

fields.forEach((f) => {
  const wrap = document.createElement("div");
  const lab = document.createElement("label");
  lab.textContent = f.label;
  wrap.appendChild(lab);
  let el;
  if (f.type === "select") {
    el = document.createElement("select");
    f.options.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = f.display ? f.display[opt] : opt;
      el.appendChild(o);
    });
  } else {
    el = document.createElement("input");
    el.type = f.type;
    if (f.placeholder) el.placeholder = f.placeholder;
    if (f.step) el.step = f.step;
  }
  el.id = f.key;
  el.style.marginTop = "4px";
  wrap.appendChild(el);
  formGrid.appendChild(wrap);
  inputs[f.key] = el;

  if (commaFields.includes(f.key)) {
    el.addEventListener("input", () => {
      const caret = el.selectionStart;
      const val = el.value.replace(/,/g, "");
      if (/[^0-9]/.test(val)) {
        el.value = val.replace(/[^0-9]/g, "");
      }
      // 포맷 후 커서 위치가 바뀔 수 있지만 단순 구현
    });
    el.addEventListener("blur", () => formatNumberField(el));
  }
});

function readForm() {
  return {
    price: commaFields.includes("price") ? parseNumberField(inputs.price) : Number(inputs.price.value || 0),
    incomeAnnual: commaFields.includes("incomeAnnual") ? parseNumberField(inputs.incomeAnnual) : Number(inputs.incomeAnnual.value || 0),
    equity: commaFields.includes("equity") ? parseNumberField(inputs.equity) : Number(inputs.equity.value || 0),
    address: inputs.address.value || "",
    homeCount: Number(inputs.homeCount.value || 0),
    lifeFirst: inputs.lifeFirst.value === "true",
    areaOver85: inputs.areaOver85.value === "true",
    productType: inputs.productType.value || "아파트",
    tradeType: inputs.tradeType.value || "매매",
    years: inputs.years.value ? Number(inputs.years.value) : undefined,
    rate: inputs.rate.value ? Number(inputs.rate.value) : undefined,
    repaymentType: inputs.repaymentType.value || undefined,
  };
}

function formatKRW(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function renderResult(r) {
  resultsEl.innerHTML = `
    <div class="result-row"><span>대출한도 (min LTV/DSR)</span><strong>${formatKRW(r.loanLimit)}</strong></div>
    <div class="result-row"><span>· LTV 한도</span><span>${formatKRW(r.ltvLimit)}</span></div>
    <div class="result-row"><span>· DSR 한도</span><span>${formatKRW(r.dsrLimit)}</span></div>
    <hr />
    <div class="result-row"><span>취득세 합계</span><strong>${formatKRW(r.taxes.total)}</strong></div>
    <div class="result-row"><span>· 취득세</span><span>${formatKRW(r.taxes.acquisitionTax)}</span></div>
    <div class="result-row"><span>· 농특세</span><span>${formatKRW(r.taxes.ruralTax)}</span></div>
    <div class="result-row"><span>· 교육세</span><span>${formatKRW(r.taxes.educationTax)}</span></div>
    <div class="result-row"><span>중개보수</span><span>${formatKRW(r.brokerage)}</span></div>
    <div class="result-row"><span>채권</span><span>${formatKRW(r.bond)}</span></div>
    <div class="result-row"><span>기타비용</span><span>${formatKRW(r.otherMisc)}</span></div>
    <div class="result-row"><span>세금+비용 합계</span><strong>${formatKRW(r.totalAcquisition)}</strong></div>
    <hr />
    <div class="result-row"><span>필요 자금 (매매가-대출)</span><strong>${formatKRW(r.neededCash)}</strong></div>
    <div class="result-row"><span>보유 자산</span><span>${formatKRW(Number(inputs.equity.value || 0))}</span></div>
    <div class="result-row"><span>부족(+)/여유(-)</span><strong>${formatKRW(r.shortage)}</strong></div>
    <div class="result-row"><span>월 상환액</span><strong>${formatKRW(r.monthlyPayment)}</strong></div>
  `;
}

function validate(form) {
  if (form.price <= 0) return "매매가를 입력해주세요";
  if (form.incomeAnnual < 0) return "연소득은 0 이상";
  if (form.homeCount < 0) return "주택 수는 0 이상";
  return null;
}

function runCalc() {
  const form = readForm();
  const err = validate(form);
  if (err) {
    errorEl.textContent = err;
    return;
  }
  errorEl.textContent = "";
  const result = computeFormResult(form);
  renderResult(result);
}

document.getElementById("calc-btn").addEventListener("click", runCalc);

// 기본값 세팅
inputs.price.value = "700000000";
inputs.incomeAnnual.value = "60000000";
inputs.equity.value = "200000000";
inputs.address.value = "서울시 강남구";
inputs.homeCount.value = "1";
inputs.lifeFirst.value = "false";
inputs.areaOver85.value = "false";
inputs.productType.value = "아파트";
inputs.tradeType.value = "매매";
inputs.years.value = "30";
inputs.rate.value = "0.04";
inputs.repaymentType.value = "원리금균등";

// 초기 계산
formatNumberField(inputs.price);
formatNumberField(inputs.incomeAnnual);
formatNumberField(inputs.equity);
runCalc();
