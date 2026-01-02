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

// 강남구 법정동 목록 (투기과열/조정 판별용)
const GANGNAM_DONGS = new Set([
  "개포동",
  "논현동",
  "대치동",
  "도곡동",
  "삼성동",
  "세곡동",
  "수서동",
  "신사동",
  "압구정동",
  "역삼동",
  "율현동",
  "일원동",
  "자곡동",
  "청담동",
]);

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
// TODO: 채권 요율/상한 확정 후 적용 예정. 현재는 0 처리.
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
  const hasGangnamGu = /강남구/.test(trimmed);
  const hasGangnamDong = Array.from(GANGNAM_DONGS).some((d) => trimmed.includes(d));
  const isGangnam = hasGangnamGu || hasGangnamDong;
  // 강남구만 투기/조정 적용 (요구사항: 강남 한정)
  return { isSpeculative: isGangnam, isAdjusted: isGangnam };
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
  const neededCash = form.price + totalAcquisition - loanLimit; // 매매가 + 세금비용 합계 - 대출
  const shortage = neededCash - form.equity;
  const repaymentType = form.repaymentType ?? DSR_DEFAULTS.repaymentType;
  const rate = form.rate ?? DSR_DEFAULTS.baseInterest;
  const years = form.years ?? DSR_DEFAULTS.defaultYears;
  const canPurchase = shortage <= 0;
  const yearlySaving = form.incomeAnnual > 0 ? form.incomeAnnual : 0;
  const yearsToSave = shortage > 0 && yearlySaving > 0 ? Math.ceil((shortage / yearlySaving) * 10) / 10 : 0;
  const monthlyPayment = computeMonthlyPayment(loanLimit, rate, years, repaymentType);
  return { loanLimit, ltvLimit, dsrLimit: dsr.limit, monthlyPayment, taxes, brokerage, bond, otherMisc, totalAcquisition, neededCash, shortage, equity: form.equity, canPurchase, yearsToSave };
}

// ----- UI -----
const formGrid = document.getElementById("form-grid");
const resultsEl = document.getElementById("results");
const errorEl = document.getElementById("error");
const mapStatusEl = document.getElementById("map-status");

const commaFields = ["price", "incomeAnnual", "equity"];
const percentFields = ["rate"]; // 입력을 % 단위로 받고 내부 계산은 소수로 변환

const fields = [
  { key: "price", label: "매매가 (원)", type: "text" },
  { key: "address", label: "주소", type: "text" },
  { key: "equity", label: "순자산 (원)", type: "text" },
  { key: "incomeAnnual", label: "연소득 (원)", type: "text" },
  { key: "homeCount", label: "매입 후 주택 수", type: "number", placeholder: "1" },
  { key: "lifeFirst", label: "생애최초 여부", type: "select", options: ["false", "true"], display: { false: "아니오", true: "예" } },
  { key: "areaOver85", label: "전용 85㎡ 초과", type: "select", options: ["false", "true"], display: { false: "이하", true: "초과" } },
  { key: "productType", label: "상품구분", type: "select", options: ["아파트", "오피스텔", "기타"] },
  { key: "tradeType", label: "거래유형", type: "select", options: ["매매", "임대차"] },
  { key: "years", label: "대출 만기 (년)", type: "select", options: ["10", "20", "30"] },
  { key: "rate", label: "금리 (연, %)", type: "text" },
  { key: "repaymentType", label: "상환방식", type: "select", options: ["원리금균등", "원금균등", "원금만기일시상환"] },
];

const inputs = {};
let rpAptEl, rpSearchBtn, rpStatusEl, rpSuggestionsEl;
const RP = typeof window !== "undefined" && window.RealPrice ? window.RealPrice : null;

let mapReadyPromise = null;
let mapCtx = {
  map: null,
  marker: null,
  geocoder: null,
  overlays: [],
  baseMarkers: [],
  clusterer: null,
  clusterDropdown: null,
  evalHooked: false,
};
const MAX_MARKERS_FOR_EVAL = 20;
const SCORE_CACHE_TTL = 5 * 60 * 1000;
const aptScoreCache = new Map();
let evaluateTimer = null;
let evaluating = false;
const CACHE_BASE = (typeof window !== "undefined" && window.REALPRICE_CACHE_URL
  ? window.REALPRICE_CACHE_URL.replace(/\/api\/cache\/suggestions.*$/, "")
  : "");
const STATIC_POINTS_URL = typeof window !== "undefined" ? window.STATIC_POINTS_URL || "" : "";
const STATIC_SUGGESTIONS_URL = typeof window !== "undefined" ? window.STATIC_SUGGESTIONS_URL || "" : "";

const FORM_STATE_KEY = "rp-form-state-v1";
const FORM_DEFAULTS = {
  price: "",
  incomeAnnual: "",
  equity: "",
  address: "",
  homeCount: "",
  lifeFirst: "false",
  areaOver85: "false",
  productType: "아파트",
  tradeType: "매매",
  years: "30",
  rate: "4.00",
  repaymentType: "원리금균등",
  rpApt: "",
};

function setMapStatus(text) {
  if (mapStatusEl) mapStatusEl.textContent = text;
}

function initKakaoMap() {
  if (mapReadyPromise) return mapReadyPromise;
  mapReadyPromise = new Promise((resolve) => {
    const container = document.getElementById("map");
    if (typeof kakao === "undefined" || !container) {
      setMapStatus("카카오 지도 SDK가 로드되지 않았습니다.");
      resolve(null);
      return;
    }
    kakao.maps.load(() => {
      const map = new kakao.maps.Map(container, { center: new kakao.maps.LatLng(37.4979, 127.0276), level: 5 });
      const marker = new kakao.maps.Marker({ position: map.getCenter(), map: null });
      const geocoder = new kakao.maps.services.Geocoder();
      const clusterer = new kakao.maps.MarkerClusterer({
        map,
        averageCenter: true,
        minLevel: 6,
        styles: [{
          width: "36px",
          height: "36px",
          background: "rgba(255,132,0,0.12)",
          borderRadius: "18px",
          border: "1px solid rgba(255,132,0,0.4)",
          color: "#d65a00",
          fontSize: "13px",
          fontWeight: "700",
          lineHeight: "36px",
          textAlign: "center",
        }],
      });
      mapCtx = { map, marker, geocoder, overlays: [], baseMarkers: [], clusterer, clusterDropdown: null, evalHooked: false };
      setMapStatus("캐시된 단지를 불러오세요.");
      resolve(mapCtx);
    });
  });
  return mapReadyPromise;
}

async function showAddressOnMap(address) {
  const ctx = await initKakaoMap();
  if (!ctx || !address) return;
  const clean = address.trim();
  if (!clean) return;
  ctx.geocoder.addressSearch(clean, (results, status) => {
    if (status !== kakao.maps.services.Status.OK || !results || !results.length) {
      setMapStatus("주소를 찾을 수 없습니다.");
      return;
    }
    const { x, y } = results[0];
    const latlng = new kakao.maps.LatLng(Number(y), Number(x));
    ctx.map.setCenter(latlng);
    ctx.marker.setPosition(latlng);
      ctx.marker.setMap(ctx.map);
    setMapStatus("지도에 위치가 표시되었습니다.");
  });
}

function clearSuggestionMarkers() {
  if (mapCtx.overlays && mapCtx.overlays.length) {
    mapCtx.overlays.forEach((ov) => ov.setMap && ov.setMap(null));
  }
  mapCtx.overlays = [];
}

function clearBaseMarkers() {
  if (mapCtx.clusterer) mapCtx.clusterer.clear();
  if (mapCtx.baseMarkers && mapCtx.baseMarkers.length) {
    mapCtx.baseMarkers.forEach((mk) => mk.setMap && mk.setMap(null));
  }
  mapCtx.baseMarkers = [];
  if (mapCtx.clusterDropdown) {
    mapCtx.clusterDropdown.setMap(null);
    mapCtx.clusterDropdown = null;
  }
}

function geocodeOnce(ctx, address) {
  return new Promise((resolve) => {
    ctx.geocoder.addressSearch(address, (results, status) => {
      if (status !== kakao.maps.services.Status.OK || !results || !results.length) {
        resolve(null);
        return;
      }
      resolve(results[0]);
    });
  });
}

function buildCandidateAddresses(it) {
  const list = [];
  const base = RP && RP.buildAddress ? RP.buildAddress(it) : "";
  if (base) list.push(base);
  const simple = [it.umdNm, it.jibun].filter(Boolean).join(" ");
  if (simple) list.push(simple);
  if (simple) list.push(`서울 ${simple}`);
  if (it.aptNm && simple) list.push(`${simple} ${it.aptNm}`);
  if (it.aptNm) list.push(it.aptNm);
  // dedupe & trim
  const uniq = Array.from(new Set(list.map((v) => v.trim()).filter(Boolean)));
  return uniq;
}

async function geocodeFirstHit(ctx, addresses) {
  for (const addr of addresses) {
    const hit = await geocodeOnce(ctx, addr);
    if (hit) return hit;
  }
  return null;
}

async function showSuggestionsOnMap(list) {
  const ctx = await initKakaoMap();
  if (!ctx) return;
  clearSuggestionMarkers();
  if (!list || !list.length) {
    setMapStatus("표시할 주소가 없습니다.");
    return;
  }

  const bounds = new kakao.maps.LatLngBounds();
  let plotted = 0;
  for (const it of list) {
    const candidates = buildCandidateAddresses(it);
    if (!candidates.length) continue;
    const geo = await geocodeFirstHit(ctx, candidates);
    if (!geo) continue;
    const latlng = new kakao.maps.LatLng(Number(geo.y), Number(geo.x));
    bounds.extend(latlng);
    const marker = new kakao.maps.Marker({ position: latlng, map: ctx.map, image: markerImage() });
    mapCtx.overlays.push(marker);
    plotted += 1;
  }

  if (plotted > 0) {
    ctx.map.setBounds(bounds);
    setMapStatus(`지도에 ${plotted}건을 표시했습니다.`);
  } else {
    setMapStatus("지오코딩 결과가 없습니다.");
  }
}

async function fetchAllPoints() {
  if (STATIC_POINTS_URL) {
    try {
      const res = await fetch(STATIC_POINTS_URL, { cache: "no-cache" });
      if (res.ok) return res.json();
    } catch (e) {
      console.warn("static points fetch failed", e);
    }
  }
  if (!CACHE_BASE) return [];
  const url = `${CACHE_BASE}/api/cache/points?months=3&max=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`cache points HTTP ${res.status}`);
  return res.json();
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || queue.length === 0) return;
    const { fn, resolve, reject } = queue.shift();
    active += 1;
    Promise.resolve()
      .then(fn)
      .then((v) => resolve(v), (e) => reject(e))
      .finally(() => {
        active -= 1;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

function markerImage(color = "orange") {
  const palette = {
    orange: { fill: "#ff7a1a", stroke: "#d65a00" },
    green: { fill: "#10b981", stroke: "#0f766e" },
    red: { fill: "#ef4444", stroke: "#b91c1c" },
  };
  const tone = palette[color] || palette.orange;
  const svg = encodeURIComponent(
    `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">\n<path d="M14 0C6.8203 0 1 5.8203 1 13C1 23.5 14 36 14 36C14 36 27 23.5 27 13C27 5.8203 21.1797 0 14 0Z" fill="${tone.fill}" stroke="${tone.stroke}"/>\n<circle cx="14" cy="13" r="6.5" fill="white" stroke="${tone.stroke}" stroke-width="1.5"/>\n</svg>`
  );
  return new kakao.maps.MarkerImage(`data:image/svg+xml,${svg}`, new kakao.maps.Size(28, 36), {
    offset: new kakao.maps.Point(14, 36),
  });
}

function setMarkerColor(marker, color) {
  if (!marker) return;
  marker.setImage(markerImage(color));
}

function distanceBetween(a, b) {
  if (!a || !b) return Infinity;
  if (kakao?.maps?.geometry?.spherical?.computeDistanceBetween) {
    return kakao.maps.geometry.spherical.computeDistanceBetween(a, b);
  }
  // fallback: approximate using simple Pythagoras on lat/lng degrees
  const dx = a.getLat() - b.getLat();
  const dy = a.getLng() - b.getLng();
  return Math.sqrt(dx * dx + dy * dy);
}

function colorMarkerByScore(marker, score) {
  if (!marker) return;
  if (score && score.ok) {
    setMarkerColor(marker, "green");
  } else if (score) {
    setMarkerColor(marker, "red");
  } else {
    setMarkerColor(marker, "orange");
  }
}

async function fetchLatestDealFromCache(aptNm) {
  if (!CACHE_BASE || !aptNm) return null;
  const cached = aptScoreCache.get(aptNm);
  if (cached && Date.now() - cached.ts < SCORE_CACHE_TTL) return cached.deal;
  const url = `${CACHE_BASE}/api/cache/suggestions?apt=${encodeURIComponent(aptNm)}&months=6&max=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const list = await res.json();
  const deal = list && list[0] ? list[0] : null;
  aptScoreCache.set(aptNm, { deal, ts: Date.now() });
  return deal;
}

async function computeMarkerScore(marker, baseForm) {
  if (!marker || !marker.__apt) return null;
  const deal = await fetchLatestDealFromCache(marker.__apt.aptNm || marker.__apt.apt || "");
  if (!deal) return null;
  const price = (Number(deal.dealAmount) || 0) * 10000;
  const addr = (RP && RP.buildAddress ? RP.buildAddress(deal) : "") || (RP && RP.buildAddress ? RP.buildAddress(marker.__apt) : "") || baseForm.address;
  const form = {
    ...baseForm,
    price,
    address: addr,
    areaOver85: Number(deal.excluUseAr) > 85,
  };
  const result = computeFormResult(form);
  return { ok: result.canPurchase, price, dealYmd: deal.dealYmd, formUsed: form };
}

function scheduleEvaluateVisibleMarkers() {
  if (evaluateTimer) clearTimeout(evaluateTimer);
  evaluateTimer = setTimeout(() => {
    evaluateVisibleMarkers();
  }, 250);
}

async function evaluateVisibleMarkers() {
  if (evaluating) return;
  const ctx = await initKakaoMap();
  if (!ctx || !ctx.map || !ctx.baseMarkers.length) return;
  const bounds = ctx.map.getBounds();
  const visible = ctx.baseMarkers.filter((m) => bounds.contain(m.getPosition()));
  if (!visible.length) return;

  // 축척이 충분히 좁아졌다면 최대 MAX_MARKERS_FOR_EVAL개까지만 중심에 가까운 순서로 평가
  const center = ctx.map.getCenter();
  const sorted = visible
    .map((m) => ({ m, dist: distanceBetween(center, m.getPosition()) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_MARKERS_FOR_EVAL)
    .map((v) => v.m);
  if (!sorted.length) return;
  const skipped = Math.max(0, visible.length - sorted.length);
  if (skipped > 0) {
    setMapStatus(`가까운 ${sorted.length}개만 우선 평가 중 (총 ${visible.length}개 보임)`);
  }
  evaluating = true;
  const baseForm = readForm();
  const limit = createLimiter(3);
  let okCount = 0;
  let failCount = 0;
  try {
    await Promise.all(
      sorted.map((marker) =>
        limit(async () => {
          try {
            const score = await computeMarkerScore(marker, baseForm);
            marker.__score = score;
            colorMarkerByScore(marker, score);
            if (score && score.ok) okCount += 1;
            else if (score) failCount += 1;
            else setMarkerColor(marker, "orange");
          } catch (err) {
            console.warn("marker score failed", err);
            setMarkerColor(marker, "orange");
          }
        })
      )
    );
    setMapStatus(`줌-인 영역 ${visible.length}개 평가 완료 (가능 ${okCount}, 불가 ${failCount})`);
  } finally {
    evaluating = false;
  }
}

async function plotBasePoints(list) {
  const ctx = await initKakaoMap();
  if (!ctx) return;
  clearBaseMarkers();
  if (!list || !list.length) {
    setMapStatus("표시할 단지가 없습니다.");
    return;
  }
  const bounds = new kakao.maps.LatLngBounds();
  let plotted = 0;
  const limit = createLimiter(8);
  const markers = [];
  await Promise.all(
    list.map((it) =>
      limit(async () => {
        const candidates = buildCandidateAddresses(it);
        if (!candidates.length) return;
        const geo = await geocodeFirstHit(ctx, candidates);
        if (!geo) return;
        const latlng = new kakao.maps.LatLng(Number(geo.y), Number(geo.x));
        bounds.extend(latlng);
        const marker = new kakao.maps.Marker({ position: latlng, title: it.aptNm || "", image: markerImage() });
        marker.__apt = it;
        kakao.maps.event.addListener(marker, "click", () => {
          if (rpAptEl) rpAptEl.value = it.aptNm || "";
          if (rpStatusEl) rpStatusEl.textContent = `지도에서 선택됨: ${it.aptNm || ""}`;
          saveFormState();
          triggerDealSearch(it.aptNm || "");
          // 즉시 평가/색상 반영 (캐시 있으면 빠르게)
          const baseForm = readForm();
          Promise.resolve(computeMarkerScore(marker, baseForm))
            .then((score) => {
              marker.__score = score;
              colorMarkerByScore(marker, score);
            })
            .catch((err) => {
              console.warn("marker score on click failed", err);
              setMarkerColor(marker, "orange");
            });
        });
        markers.push(marker);
        mapCtx.baseMarkers.push(marker);
        plotted += 1;
      })
    )
  );
  if (plotted > 0) {
    if (ctx.clusterer) {
      ctx.clusterer.addMarkers(markers);
      kakao.maps.event.addListener(ctx.clusterer, "clusterclick", (cluster) => {
        const level = ctx.map.getLevel();
        ctx.map.setLevel(Math.max(level - 1, 1), { anchor: cluster.getCenter() });
      });
    } else {
      markers.forEach((m) => m.setMap(ctx.map));
    }
    ctx.map.setBounds(bounds);
    setMapStatus(`지도에 ${plotted}단지를 표시했습니다. 핀 또는 클러스터를 선택하세요.`);
    if (ctx.map && !mapCtx.evalHooked) {
      kakao.maps.event.addListener(ctx.map, "idle", scheduleEvaluateVisibleMarkers);
      mapCtx.evalHooked = true;
    }
    scheduleEvaluateVisibleMarkers();
  } else {
    setMapStatus("지오코딩 결과가 없습니다.");
  }
}

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

function parsePercentField(el) {
  const raw = (el.value || "").toString().replace(/,/g, "").replace(/%/g, "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatPercentField(el) {
  const n = parsePercentField(el);
  if (!el.value) {
    el.value = "";
  } else {
    el.value = n.toFixed(2);
  }
  return n;
}

function saveFormState() {
  try {
    if (!window.localStorage) return;
    const payload = {};
    Object.keys(inputs).forEach((k) => {
      payload[k] = inputs[k]?.value ?? "";
    });
    if (rpAptEl) payload.rpApt = rpAptEl.value || "";
    window.localStorage.setItem(FORM_STATE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("failed to save form state", e);
  }
}

function loadFormState() {
  try {
    if (!window.localStorage) return;
    const raw = window.localStorage.getItem(FORM_STATE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    Object.keys(inputs).forEach((k) => {
      if (stored[k] != null && inputs[k]) inputs[k].value = stored[k];
    });
    if (stored.rpApt != null && rpAptEl) rpAptEl.value = stored.rpApt;
  } catch (e) {
    console.warn("failed to load form state", e);
  }
}

function applyDefaultValues() {
  Object.entries(FORM_DEFAULTS).forEach(([k, v]) => {
    if (k === "rpApt") {
      if (rpAptEl && !rpAptEl.value) rpAptEl.value = v;
      return;
    }
    if (inputs[k] && !inputs[k].value) {
      inputs[k].value = v;
    }
  });
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

  if (percentFields.includes(f.key)) {
    el.addEventListener("input", () => {
      const val = el.value.replace(/[^0-9.]/g, "");
      el.value = val;
    });
    el.addEventListener("blur", () => formatPercentField(el));
  }

  el.addEventListener("change", () => {
    saveFormState();
    scheduleEvaluateVisibleMarkers();
  });
  el.addEventListener("blur", () => {
    saveFormState();
    scheduleEvaluateVisibleMarkers();
  });
});

// ----- 실거래가 검색 UI -----
rpAptEl = document.getElementById("rp-apt");
rpSearchBtn = document.getElementById("rp-search");
rpStatusEl = document.getElementById("rp-status");
rpSuggestionsEl = document.getElementById("rp-suggestions");

loadFormState();
applyDefaultValues();
saveFormState();

if (rpAptEl) rpAptEl.addEventListener("input", saveFormState);

function clearSuggestions() {
  rpSuggestionsEl.innerHTML = "";
}

function renderSuggestions(list) {
  if (!list || list.length === 0) {
    rpSuggestionsEl.innerHTML = '<div style="color:#94a3b8;">검색 결과 없음</div>';
    return;
  }
  rpSuggestionsEl.innerHTML = "";
  list.forEach((it) => {
      const amtRaw = Number(it.dealAmount) || 0; // RTMS 거래금액은 만원 단위
      const amtWon = amtRaw * 10000; // 원 단위로 변환
    const sqm = Number(it.excluUseAr) || 0;
    const py = sqm ? (sqm * 0.3025).toFixed(1) : "-";
      const lawdLabel = it.lawdCd ? ` (${it.lawdCd})` : "";
    const row = document.createElement("div");
    row.style.padding = "6px";
    row.style.borderBottom = "1px solid #e2e8f0";
    row.style.cursor = "pointer";
      const addr = RP && RP.buildAddress ? RP.buildAddress(it) : "";
      row.innerHTML = `
        <div style="font-weight:600;">${it.aptNm || "-"} <span style="color:#64748b; font-weight:400; font-size:12px;">${lawdLabel}</span></div>
          <div style="color:#475569; font-size:12px;">거래가: ${formatKRW(amtWon)} | 일자: ${it.dealYmd} | 면적: ${it.excluUseAr || "-"}㎡ (${py}평) | 층: ${it.floor || "-"}</div>
        <div style="color:#475569; font-size:12px;">주소: ${addr}</div>
      `;
    row.addEventListener("click", () => {
      // 가격/주소 자동 입력
        inputs.price.value = amtWon.toLocaleString("ko-KR");
      formatNumberField(inputs.price);
        if (addr) {
          inputs.address.value = addr;
      }
      showAddressOnMap(addr);
      // 실거래가 API는 아파트 매매 기준 → 상품구분/거래유형을 자동 설정
      if (inputs.productType) {
        inputs.productType.value = "아파트";
      }
      if (inputs.tradeType) {
        inputs.tradeType.value = "매매";
      }
      clearSuggestions();
      rpStatusEl.textContent = "자동입력 완료 (매매가·주소·상품구분 반영)";
      // 면적도 참고용으로 입력
      if (it.excluUseAr) {
        inputs.areaOver85.value = Number(it.excluUseAr) > 85 ? "true" : "false";
      }
      saveFormState();
      scheduleEvaluateVisibleMarkers();
    });
    rpSuggestionsEl.appendChild(row);
  });
}

async function handleSearchDeals() {
  if (!rpAptEl) return;
  const apt = rpAptEl.value.trim();
  if (!apt) {
    rpStatusEl.textContent = "아파트명을 입력하세요";
    return;
  }
  saveFormState();
    if (!RP || !RP.findSuggestionsByName) {
      rpStatusEl.textContent = "실거래가 모듈이 로드되지 않았습니다";
      return;
    }
  try {
    rpStatusEl.textContent = "검색 중...";
    clearSuggestions();
    const list = await RP.findSuggestionsByName({ aptName: apt, months: 6, maxResults: 10 });
    renderSuggestions(list);
    showSuggestionsOnMap(list);
    rpStatusEl.textContent = list.length ? "결과를 클릭해 자동 입력" : "검색 결과 없음";
  } catch (e) {
    rpStatusEl.textContent = `에러: ${e.message || e}`;
    console.error(e);
  }
}

if (rpSearchBtn) {
  rpSearchBtn.addEventListener("click", handleSearchDeals);
}

function triggerDealSearch(aptName) {
  if (!rpAptEl) return;
  if (aptName) rpAptEl.value = aptName;
  saveFormState();
  handleSearchDeals();
}

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
    rate: percentFields.includes("rate") ? parsePercentField(inputs.rate) / 100 : (inputs.rate.value ? Number(inputs.rate.value) : undefined),
    repaymentType: inputs.repaymentType.value || undefined,
  };
}

function formatKRW(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

function renderResult(r) {
  const ruralLine = r.taxes.ruralTax > 0
    ? `<div class="result-row"><span>· 농특세</span><span>${formatKRW(r.taxes.ruralTax)}</span></div>`
    : "";
  const monthlyLine = r.canPurchase
    ? `<div class="result-row"><span>월 상환액</span><strong>${formatKRW(r.monthlyPayment)}</strong></div>`
    : "";
  const shortageLine = r.shortage > 0
    ? `<div class="result-row"><span>부족 (추가 필요 자금)</span><strong>-${formatKRW(r.shortage)}</strong></div>`
    : "";
  const availabilityColor = r.canPurchase ? "#0f766e" : "#b91c1c";
  resultsEl.innerHTML = `
    <div class="result-row"><span>대출한도 (min LTV/DSR)</span><strong>${formatKRW(r.loanLimit)}</strong></div>
    <div class="result-row"><span>· LTV 한도</span><span>${formatKRW(r.ltvLimit)}</span></div>
    <div class="result-row"><span>· DSR 한도</span><span>${formatKRW(r.dsrLimit)}</span></div>
    <hr />
    <div class="result-row"><span>취득세 합계</span><strong>${formatKRW(r.taxes.total)}</strong></div>
    <div class="result-row"><span>· 취득세</span><span>${formatKRW(r.taxes.acquisitionTax)}</span></div>
    ${ruralLine}
    <div class="result-row"><span>· 교육세</span><span>${formatKRW(r.taxes.educationTax)}</span></div>
    <div class="result-row"><span>중개보수</span><span>${formatKRW(r.brokerage)}</span></div>
    <div class="result-row"><span>기타비용</span><span>${formatKRW(r.otherMisc)}</span></div>
    <div class="result-row"><span>세금+비용 합계</span><strong>${formatKRW(r.totalAcquisition)}</strong></div>
    <hr />
    <div class="result-row"><span>필요 자금 (매매가+세금비용-대출)</span><strong>${formatKRW(r.neededCash)}</strong></div>
    <div class="result-row"><span>보유 자산</span><span>${formatKRW(r.equity)}</span></div>
    ${shortageLine}
    ${monthlyLine}
    <hr />
    <div class="result-row"><span>매입 가능 여부</span><strong style="color:${availabilityColor};">${r.canPurchase ? "가능" : "불가능"}</strong></div>
    <div class="result-row"><span>부족 시 소요 기간(연)</span><span style="color:${availabilityColor};">${r.yearsToSave}</span></div>
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

initKakaoMap();

// 캐시된 단지 전체를 지도에 표시
(async () => {
  try {
    const points = await fetchAllPoints();
    await plotBasePoints(points);
  } catch (e) {
    setMapStatus(`지도 로드 에러: ${e.message || e}`);
    console.error(e);
  }
})();
