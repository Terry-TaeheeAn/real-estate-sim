// 취득세/농특세/교육세 규칙 및 계산 유틸리티 + 확장용 상수 스켈레톤
// - 금액 단위: 원, 세율 단위: 소수(예: 1% => 0.01)
// - priceMin 포함, priceMax 미만 구간으로 매칭합니다.

export type HomeCountTier = 1 | 2 | 3 | 4; // 4는 4주택 이상

export type RateBasis = "price" | "acquisitionTax"; // 금액 기준 또는 취득세 기준

export interface TaxComponentRate {
  basis: RateBasis;
  rate: number; // basis가 price면 금액 * rate, acquisitionTax면 취득세 * rate
  areaOver85Only?: boolean; // true면 전용 85㎡ 초과 시에만 적용 (농특세)
}

// LTV 규칙용 스켈레톤 (엑셀 수치로 채워야 함)
export type RegionTag = "general" | "adjusted" | "speculative";

export interface LtvRule {
  isSpeculative: boolean; // 투기과열 여부
  lifeFirst: boolean; // 생애최초 여부
  homeCount?: 0 | 1 | 2 | 3 | 4; // 무주택은 0, 4는 4주택 이상 (필요 시 확장)
  priceMin: number;
  priceMax: number | null; // null이면 상한 없음
  ltv: number; // 소수 (예: 0.7)
  maxLoan: number | null; // 구간별 최대 대출한도. 제한 없으면 null
  note?: string;
  regionTag?: RegionTag; // 추후 일반/조정 구분이 필요하면 사용
}

export interface RegionPolicy {
  isSpeculative: boolean;
  isAdjusted: boolean;
}

// 임시 규제 판별 로직: 주소가 "서울"로 시작하면 투기과열/조정 모두 true로 가정.
// TODO: 규제지역 공식 테이블(시군구별)로 치환하여 정확도 보강 필요.
export function inferRegionPolicyFromAddress(address: string): RegionPolicy {
  const trimmed = (address || "").trim();
  const isSeoul = trimmed.startsWith("서울");
  if (isSeoul) {
    return { isSpeculative: true, isAdjusted: true };
  }
  return { isSpeculative: false, isAdjusted: false };
}

// LTV 규칙: 
// - 생애최초 여부와 무관하게, 투기과열이면 구간별 최대 대출한도(6억/4억/2억) 적용
// - LTV 자체는 생애최초 70%, 일반지역 70%, 투기과열+비생애 40%를 유지하되, 투기과열 구간별 cap이 우선 적용
export const LTV_RULES: LtvRule[] = [
  // 투기 X (생애최초 여부 무관 70%, 별도 상한 없음)
  { isSpeculative: false, lifeFirst: false, priceMin: 0, priceMax: Infinity, ltv: 0.7, maxLoan: null },
  { isSpeculative: false, lifeFirst: true, priceMin: 0, priceMax: Infinity, ltv: 0.7, maxLoan: null },

  // 투기 O (생애최초 여부 무관, 구간별 최대 대출한도 적용)
  { isSpeculative: true, lifeFirst: true, priceMin: 0, priceMax: 1_500_000_000, ltv: 0.7, maxLoan: 600_000_000 },
  { isSpeculative: true, lifeFirst: true, priceMin: 1_500_000_000, priceMax: 2_500_000_000, ltv: 0.7, maxLoan: 400_000_000 },
  { isSpeculative: true, lifeFirst: true, priceMin: 2_500_000_000, priceMax: Infinity, ltv: 0.7, maxLoan: 200_000_000 },

  { isSpeculative: true, lifeFirst: false, priceMin: 0, priceMax: 1_500_000_000, ltv: 0.4, maxLoan: 600_000_000 },
  { isSpeculative: true, lifeFirst: false, priceMin: 1_500_000_000, priceMax: 2_500_000_000, ltv: 0.4, maxLoan: 400_000_000 },
  { isSpeculative: true, lifeFirst: false, priceMin: 2_500_000_000, priceMax: Infinity, ltv: 0.4, maxLoan: 200_000_000 },
];

// DSR 기본값 스켈레톤 (엑셀 수치로 채움)
export interface DsrDefaults {
  ratio: number; // 예: 0.4 => 40%
  maxYears: number; // 최대 허용 만기
  defaultYears: number; // 기본 만기
  baseInterest: number; // 연 금리 소수
  repaymentType: "원리금균등" | "원금균등" | "원금만기일시상환";
}

export const DSR_DEFAULTS: DsrDefaults = {
  ratio: 0.4,
  maxYears: 30,
  defaultYears: 30,
  baseInterest: 0.04,
  repaymentType: "원리금균등",
};

// 중개보수 테이블 스켈레톤
export interface BrokerageFeeRule {
  type: "아파트" | "오피스텔" | "기타";
  tradeType: "매매" | "임대차";
  priceMin: number;
  priceMax: number | null; // null이면 상한 없음
  rate: number; // 소수
  cap: number | null; // 상한액 (원) 없으면 null
  areaUnder85?: boolean; // 필요 시 조건 추가
  hasFacilities?: boolean; // 오피스텔 설비 조건 등
}

// 아파트 매매 기준 (엑셀/고시 수수료 상한)
export const BROKERAGE_FEE_TABLE: BrokerageFeeRule[] = [
  { type: "아파트", tradeType: "매매", priceMin: 0, priceMax: 50_000_000, rate: 0.006, cap: null },
  { type: "아파트", tradeType: "매매", priceMin: 50_000_000, priceMax: 200_000_000, rate: 0.005, cap: 800_000 },
  { type: "아파트", tradeType: "매매", priceMin: 200_000_000, priceMax: 900_000_000, rate: 0.004, cap: null },
  { type: "아파트", tradeType: "매매", priceMin: 900_000_000, priceMax: 1_200_000_000, rate: 0.005, cap: null },
  { type: "아파트", tradeType: "매매", priceMin: 1_200_000_000, priceMax: 1_500_000_000, rate: 0.006, cap: null },
  { type: "아파트", tradeType: "매매", priceMin: 1_500_000_000, priceMax: Infinity, rate: 0.007, cap: null },
  // TODO: 오피스텔/임대차/그 외는 엑셀 표 기준으로 추가
];

// 채권매입비 테이블 스켈레톤
export interface BondRule {
  priceMin: number;
  priceMax: number | null;
  rate: number; // 소수
  cap?: number | null; // 상한이 있다면 입력
}

// TODO: 엑셀 산식에 맞게 채워야 합니다.
export const BOND_TABLE: BondRule[] = [
  // TODO: 엑셀 표/산식으로 채권매입비 요율·상한을 채워야 합니다.
  // { priceMin: 0, priceMax: 600_000_000, rate: 0, cap: null },
];

// 기타 비용 기본값 (사용자 수정 가능)
export const OTHER_COST_DEFAULTS = {
  taxAndFees: 12_957_333,
  brokerage: 2_840_000,
  miscCost: 15_797_333, // 합계 (예시 시나리오 기준)
};

// ---------------------- 계산 유틸 ----------------------

export type RepaymentType = "원리금균등" | "원금균등" | "원금만기일시상환";

export interface FormValues {
  price: number; // 매매가
  incomeAnnual: number; // 연소득
  equity: number; // 순자산
  address: string; // 주소 문자열
  lifeFirst: boolean; // 생애최초 여부
  areaOver85: boolean; // 전용 85㎡ 초과 여부
  homeCount: number; // 매입 후 주택 수
  productType: "아파트" | "오피스텔" | "기타";
  tradeType: "매매" | "임대차";
  years?: number; // 대출 만기 (없으면 기본)
  rate?: number; // 연 금리 (없으면 기본)
  repaymentType?: RepaymentType; // 없으면 기본
}

export interface LoanLimits {
  ltvLimit: number;
  dsrLimit: number;
  loanLimit: number;
  ltvRule: LtvRule | null;
}

export interface CostBreakdown {
  taxes: AcquisitionTaxBreakdown;
  brokerage: number;
  bond: number;
  otherMisc: number;
  totalAcquisition: number; // 세금+보수+채권+기타
}

export interface AffordabilityResult {
  loanLimits: LoanLimits;
  costs: CostBreakdown;
  neededCash: number; // 매매가 - 대출한도
  equity: number;
  shortage: number; // 양수면 부족, 음수면 여유
  monthlyPayment: number;
}

function findLtvRule(price: number, isSpeculative: boolean, lifeFirst: boolean): LtvRule | null {
  return (
    LTV_RULES.find(
      (r) =>
        r.isSpeculative === isSpeculative &&
        r.lifeFirst === lifeFirst &&
        price >= r.priceMin &&
        (r.priceMax === null || price < r.priceMax)
    ) || null
  );
}

function computeLtvLimit(price: number, isSpeculative: boolean, lifeFirst: boolean): { limit: number; rule: LtvRule | null } {
  const rule = findLtvRule(price, isSpeculative, lifeFirst);
  if (!rule) return { limit: 0, rule: null };
  const ltvAmt = price * rule.ltv;
  const capped = rule.maxLoan != null ? Math.min(ltvAmt, rule.maxLoan) : ltvAmt;
  return { limit: capped, rule };
}

function pmt(principal: number, annualRate: number, months: number): number {
  if (months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  const denom = 1 - Math.pow(1 + r, -months);
  return (principal * r) / denom;
}

function invertAnnuity(maxMonthly: number, annualRate: number, months: number): number {
  if (months <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return maxMonthly * months;
  const denom = 1 - Math.pow(1 + r, -months);
  return (maxMonthly * denom) / r;
}

function invertPrincipalEqual(maxMonthly: number, annualRate: number, months: number): number {
  if (months <= 0) return 0;
  const r = annualRate / 12;
  // 최고 월 상환액(첫 달) 기준 역산: P/n + P*r/12 = maxMonthly
  const a = 1 / months + r;
  if (a <= 0) return 0;
  return maxMonthly / a;
}

function invertInterestOnly(maxMonthly: number, annualRate: number): number {
  const r = annualRate / 12;
  if (r === 0) return 0;
  return maxMonthly / r;
}

function computeDsrLimit(incomeAnnual: number, opts: { ratio?: number; years?: number; rate?: number; repaymentType?: RepaymentType }): { limit: number; monthlyAllowance: number } {
  const ratio = opts.ratio ?? DSR_DEFAULTS.ratio;
  const years = Math.min(opts.years ?? DSR_DEFAULTS.defaultYears, DSR_DEFAULTS.maxYears);
  const rate = opts.rate ?? DSR_DEFAULTS.baseInterest;
  const repayment = opts.repaymentType ?? DSR_DEFAULTS.repaymentType;

  const monthlyIncome = incomeAnnual / 12;
  const monthlyAllowance = monthlyIncome * ratio;
  const months = years * 12;

  let principal = 0;
  if (repayment === "원리금균등") {
    principal = invertAnnuity(monthlyAllowance, rate, months);
  } else if (repayment === "원금균등") {
    principal = invertPrincipalEqual(monthlyAllowance, rate, months);
  } else {
    principal = invertInterestOnly(monthlyAllowance, rate);
  }

  return { limit: Math.max(0, principal), monthlyAllowance };
}

function findBrokerageRule(type: "아파트" | "오피스텔" | "기타", tradeType: "매매" | "임대차", price: number): BrokerageFeeRule | null {
  return (
    BROKERAGE_FEE_TABLE.find(
      (r) =>
        r.type === type &&
        r.tradeType === tradeType &&
        price >= r.priceMin &&
        (r.priceMax === null || price < r.priceMax)
    ) || null
  );
}

function computeBrokerageAmount(type: "아파트" | "오피스텔" | "기타", tradeType: "매매" | "임대차", price: number): number {
  const rule = findBrokerageRule(type, tradeType, price);
  if (!rule) return 0;
  const fee = price * rule.rate;
  return rule.cap != null ? Math.min(fee, rule.cap) : fee;
}

function computeBondAmount(price: number): number {
  const rule = BOND_TABLE.find((r) => price >= r.priceMin && (r.priceMax === null || price < r.priceMax));
  if (!rule) return 0;
  const amt = price * rule.rate;
  if (rule.cap != null) return Math.min(amt, rule.cap);
  return amt;
}

function computeMonthlyPayment(principal: number, annualRate: number, years: number, repaymentType: RepaymentType): number {
  const months = years * 12;
  if (principal <= 0 || months <= 0) return 0;
  if (repaymentType === "원리금균등") return pmt(principal, annualRate, months);
  if (repaymentType === "원금균등") {
    const r = annualRate / 12;
    return principal / months + principal * r; // 첫 달 기준
  }
  const r = annualRate / 12;
  return principal * r; // 이자만
}

export function computeFormResult(form: FormValues): AffordabilityResult {
  const region = inferRegionPolicyFromAddress(form.address);

  const { limit: ltvLimit, rule: ltvRule } = computeLtvLimit(form.price, region.isSpeculative, form.lifeFirst);

  const dsr = computeDsrLimit(form.incomeAnnual, {
    ratio: DSR_DEFAULTS.ratio,
    years: form.years,
    rate: form.rate,
    repaymentType: form.repaymentType,
  });

  const loanLimit = Math.min(ltvLimit, dsr.limit);

  const taxes = computeAcquisitionTaxes({
    homeCount: form.homeCount,
    isAdjusted: region.isAdjusted,
    price: form.price,
    areaOver85: form.areaOver85,
  });

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

  return {
    loanLimits: {
      ltvLimit,
      dsrLimit: dsr.limit,
      loanLimit,
      ltvRule,
    },
    costs: {
      taxes,
      brokerage,
      bond,
      otherMisc,
      totalAcquisition,
    },
    neededCash,
    equity: form.equity,
    shortage,
    monthlyPayment,
  };
}

export type AcquisitionRate =
  | { kind: "flat"; rate: number }
  | {
      kind: "progressive";
      calc: (price: number) => number; // 반환: 취득세율(소수)
    };

export interface AcquisitionTaxRule {
  homeCount: HomeCountTier;
  isAdjusted: boolean;
  priceMin: number;
  priceMax: number | null; // null이면 상한 없음
  acquisitionRate: AcquisitionRate;
  ruralRate?: TaxComponentRate; // 농특세
  eduRate?: TaxComponentRate; // 지방교육세
}

// 6~9억 구간의 (취득가액 × 2/3억 - 3) × 1% 공식을 함수로 정의
const midBracketRate: AcquisitionRate = {
  kind: "progressive",
  calc: (price: number) => {
    // price 단위: 원. 공식은 억 단위 계산 뒤 %로 변환
    const priceInHundredMillions = price / 100_000_000;
    const ratePercent = priceInHundredMillions * (2 / 3) - 3; // % 단위 결과
    return Math.max(0, ratePercent / 100); // 소수로 변환 (하한 0 처리)
  },
};

export const ACQ_TAX_RULES: AcquisitionTaxRule[] = [
  // 1주택자 - 비조정
  {
    homeCount: 1,
    isAdjusted: false,
    priceMin: 0,
    priceMax: 600_000_000,
    acquisitionRate: { kind: "flat", rate: 0.01 },
    ruralRate: { basis: "price", rate: 0 },
    eduRate: { basis: "price", rate: 0.001 },
  },
  {
    homeCount: 1,
    isAdjusted: false,
    priceMin: 600_000_000,
    priceMax: 900_000_000,
    acquisitionRate: midBracketRate,
    ruralRate: { basis: "price", rate: 0.002, areaOver85Only: true },
    eduRate: { basis: "acquisitionTax", rate: 0.1 }, // 취득세의 10%
  },
  {
    homeCount: 1,
    isAdjusted: false,
    priceMin: 900_000_000,
    priceMax: null,
    acquisitionRate: { kind: "flat", rate: 0.03 },
    ruralRate: { basis: "price", rate: 0.006, areaOver85Only: true },
    eduRate: { basis: "price", rate: 0.003 },
  },
  // 1주택자 - 조정대상지역
  {
    homeCount: 1,
    isAdjusted: true,
    priceMin: 0,
    priceMax: null,
    acquisitionRate: { kind: "flat", rate: 0.08 },
    ruralRate: { basis: "price", rate: 0.006, areaOver85Only: true },
    eduRate: { basis: "price", rate: 0.004 },
  },

  // 2주택자 - 비조정
  {
    homeCount: 2,
    isAdjusted: false,
    priceMin: 0,
    priceMax: 600_000_000,
    acquisitionRate: { kind: "flat", rate: 0.01 },
    ruralRate: { basis: "price", rate: 0 },
    eduRate: { basis: "price", rate: 0.001 },
  },
  {
    homeCount: 2,
    isAdjusted: false,
    priceMin: 600_000_000,
    priceMax: 900_000_000,
    acquisitionRate: midBracketRate,
    ruralRate: { basis: "price", rate: 0.002, areaOver85Only: true },
    eduRate: { basis: "acquisitionTax", rate: 0.1 },
  },
  {
    homeCount: 2,
    isAdjusted: false,
    priceMin: 900_000_000,
    priceMax: null,
    acquisitionRate: { kind: "flat", rate: 0.03 },
    ruralRate: { basis: "price", rate: 0.006, areaOver85Only: true },
    eduRate: { basis: "price", rate: 0.003 },
  },
  // 2주택자 - 조정대상지역
  {
    homeCount: 2,
    isAdjusted: true,
    priceMin: 0,
    priceMax: null,
    acquisitionRate: { kind: "flat", rate: 0.08 },
    ruralRate: { basis: "price", rate: 0.006, areaOver85Only: true },
    eduRate: { basis: "price", rate: 0.004 },
  },

  // 3주택자
  {
    homeCount: 3,
    isAdjusted: false,
    priceMin: 0,
    priceMax: null,
    acquisitionRate: { kind: "flat", rate: 0.08 },
    ruralRate: { basis: "price", rate: 0.006, areaOver85Only: true },
    eduRate: { basis: "price", rate: 0.004 },
  },
  {
    homeCount: 3,
    isAdjusted: true,
    priceMin: 0,
    priceMax: null,
    acquisitionRate: { kind: "flat", rate: 0.12 },
    ruralRate: { basis: "price", rate: 0.01, areaOver85Only: true },
    eduRate: { basis: "price", rate: 0.004 },
  },

  // 4주택 이상 (지역 무관 동일 12%)
  {
    homeCount: 4,
    isAdjusted: false,
    priceMin: 0,
    priceMax: null,
    acquisitionRate: { kind: "flat", rate: 0.12 },
    ruralRate: { basis: "price", rate: 0.01, areaOver85Only: true },
    eduRate: { basis: "price", rate: 0.004 },
  },
  {
    homeCount: 4,
    isAdjusted: true,
    priceMin: 0,
    priceMax: null,
    acquisitionRate: { kind: "flat", rate: 0.12 },
    ruralRate: { basis: "price", rate: 0.01, areaOver85Only: true },
    eduRate: { basis: "price", rate: 0.004 },
  },
];

export interface AcquisitionTaxInput {
  homeCount: number; // 매입 완료 후 주택 수 (정수). 4 이상이면 4로 취급.
  isAdjusted: boolean;
  price: number; // 취득가액 (원)
  areaOver85: boolean;
}

export interface AcquisitionTaxBreakdown {
  acquisitionTax: number;
  ruralTax: number;
  educationTax: number;
  total: number;
  matchedRule: AcquisitionTaxRule | null;
  effectiveAcquisitionRate: number; // 소수 (예: 0.03)
}

function findRule(input: AcquisitionTaxInput): AcquisitionTaxRule | null {
  const normalizedHomeCount: HomeCountTier = (input.homeCount >= 4
    ? 4
    : Math.max(1, Math.min(4, Math.round(input.homeCount)))) as HomeCountTier;

  return (
    ACQ_TAX_RULES.find((rule) => {
      const withinPrice =
        input.price >= rule.priceMin &&
        (rule.priceMax === null || input.price < rule.priceMax);
      return (
        withinPrice &&
        rule.homeCount === normalizedHomeCount &&
        rule.isAdjusted === input.isAdjusted
      );
    }) || null
  );
}

function resolveAcquisitionRate(
  price: number,
  rate: AcquisitionRate
): number {
  if (rate.kind === "flat") return rate.rate;
  return rate.calc(price);
}

function computeComponent(
  baseAmount: number,
  comp?: TaxComponentRate,
  areaOver85?: boolean
): number {
  if (!comp) return 0;
  if (comp.areaOver85Only && !areaOver85) return 0;
  return baseAmount * comp.rate;
}

export function computeAcquisitionTaxes(
  input: AcquisitionTaxInput
): AcquisitionTaxBreakdown {
  if (input.price <= 0) {
    return {
      acquisitionTax: 0,
      ruralTax: 0,
      educationTax: 0,
      total: 0,
      matchedRule: null,
      effectiveAcquisitionRate: 0,
    };
  }

  const rule = findRule(input);

  if (!rule) {
    return {
      acquisitionTax: 0,
      ruralTax: 0,
      educationTax: 0,
      total: 0,
      matchedRule: null,
      effectiveAcquisitionRate: 0,
    };
  }

  const acquisitionRate = resolveAcquisitionRate(input.price, rule.acquisitionRate);
  const acquisitionTax = input.price * acquisitionRate;
  const ruralTax = computeComponent(
    rule.ruralRate?.basis === "acquisitionTax" ? acquisitionTax : input.price,
    rule.ruralRate,
    input.areaOver85
  );
  const educationTax = computeComponent(
    rule.eduRate?.basis === "acquisitionTax" ? acquisitionTax : input.price,
    rule.eduRate,
    input.areaOver85
  );

  const total = acquisitionTax + ruralTax + educationTax;

  return {
    acquisitionTax,
    ruralTax,
    educationTax,
    total,
    matchedRule: rule,
    effectiveAcquisitionRate: acquisitionRate,
  };
}

RealPrice.setLawdList(["11680"]); // 강남구

git remote set-url origin https://github.com/Terry-TaeheeAn/real-estate-sim.git
cd /Users/antaehee/Desktop/real_estate/web-sim && chmod +x dev.sh && ./dev.sh

curl -I http://127.0.0.1:3000/sim.js
curl -I http://127.0.0.1:3000/realprice-fetch.js

curl -i -G "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade" \
  --data-urlencode "serviceKey=여기에_정상키" \
  --data-urlencode "LAWD_CD=28110" \
  --data-urlencode "DEAL_YMD=202411" \
  --data-urlencode "pageNo=1" \
  --data-urlencode "numOfRows=10"
