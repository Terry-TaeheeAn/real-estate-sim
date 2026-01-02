// 국토부 실거래가 API (RTMS 아파트 매매) 간단 클라이언트
// - 이 파일은 web-sim에 병행 로드하여, 아파트명 검색 → 최근 거래가 자동 입력에 활용할 수 있는 스켈레톤입니다.
// - 서비스키는 HTML에서 주입하거나, 여기 상단에 직접 채워도 되지만 공개 저장소에 커밋하지 마세요.
// - 호출량 절약을 위해 최소한의 파이프만 포함했습니다. 실제 서비스에서는 백엔드 캐시를 권장합니다.

// TODO: 서비스키를 안전한 방식(예: 백엔드 프록시, .env 주입)으로 전달하세요.
// 절대 평문으로 커밋하지 마세요. 빈 문자열로 두고 프록시/환경변수로 주입하세요.
let REALPRICE_SERVICE_KEY = ""; // 예: "eaddd..." (직접 커밋 금지)
let REALPRICE_PROXY_URL = ""; // 예: "http://localhost:5001/api/rtms" (백엔드 프록시 경로)
let REALPRICE_CACHE_URL = ""; // 예: "http://localhost:5001/api/cache/suggestions" (캐시 조회 경로)
let STATIC_SUGGESTIONS_URL = ""; // github.io 정적 스냅샷용

// 전역에서 미리 주입된 기본값 사용 (index.html 등에서 window.REALPRICE_PROXY_URL 설정 시)
if (typeof window !== "undefined" && window.REALPRICE_PROXY_URL) {
  REALPRICE_PROXY_URL = window.REALPRICE_PROXY_URL;
}
if (typeof window !== "undefined" && window.REALPRICE_CACHE_URL) {
  REALPRICE_CACHE_URL = window.REALPRICE_CACHE_URL;
}
if (typeof window !== "undefined" && window.STATIC_SUGGESTIONS_URL) {
  STATIC_SUGGESTIONS_URL = window.STATIC_SUGGESTIONS_URL;
}

const RTMS_ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";

let staticSuggestionsCache = null;

// 기본 LAWD_CD 목록(서울+부산 예시). setLawdList로 교체 가능.
let LAWD_CD_LIST = ["11680"]; // MVP: 강남구만 기본 조회로 호출량 축소

// 최근 36개월 DEAL_YMD 리스트 생성
function getLast36Months() {
  const today = new Date();
  const arr = [];
  for (let i = 0; i < 36; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    arr.push(`${y}${m}`);
  }
  return arr;
}

function getLastNMonths(n) {
  return getLast36Months().slice(0, n);
}

// LAWD_CD + DEAL_YMD 하나 호출 (XML → JSON 파싱 없음: text 반환)
async function fetchDeals(lawdCd, dealYmd, pageNo = 1, numOfRows = 200) {
  if (!REALPRICE_PROXY_URL && !REALPRICE_SERVICE_KEY) throw new Error("서비스키가 없거나 프록시가 설정되지 않았습니다");
  const url = new URL(REALPRICE_PROXY_URL || RTMS_ENDPOINT);
  if (REALPRICE_PROXY_URL) {
    url.searchParams.set("lawdCd", lawdCd);
    url.searchParams.set("dealYmd", dealYmd);
  } else {
    url.searchParams.set("serviceKey", REALPRICE_SERVICE_KEY);
    url.searchParams.set("LAWD_CD", lawdCd);
    url.searchParams.set("DEAL_YMD", dealYmd);
  }
  url.searchParams.set("pageNo", pageNo.toString());
  url.searchParams.set("numOfRows", numOfRows.toString());
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text;
}

// 간단한 XML → JSON 파서 (response.body.items.item 만 추출)
function parseDeals(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const totalCountNode = doc.getElementsByTagName("totalCount")[0];
  const totalCount = totalCountNode ? Number(totalCountNode.textContent || 0) : null;
  const items = Array.from(doc.getElementsByTagName("item"));
  return items.map((el) => {
    const get = (tag) => {
      const node = el.getElementsByTagName(tag)[0];
      return node ? node.textContent?.trim() ?? "" : "";
    };
    return {
      lawdCd: get("LAWD_CD"),
      dealYmd: get("DEAL_YMD"),
      aptNm: get("아파트") || get("aptNm"),
      umdNm: get("법정동") || get("umdNm"),
      jibun: get("지번") || get("jibun"),
      dealAmount: get("거래금액") || get("dealAmount"),
      dealYear: get("년") || get("dealYear"),
      dealMonth: get("월") || get("dealMonth"),
      dealDay: get("일") || get("dealDay"),
      excluUseAr: get("전용면적") || get("excluUseAr"),
      floor: get("층") || get("floor"),
    };
  });
}

async function fetchDealsAllPages(lawdCd, dealYmd, maxPages = 1, rowsPerPage = 100) {
  let page = 1;
  let all = [];
  while (page <= maxPages) {
    const xml = await fetchDeals(lawdCd, dealYmd, page, rowsPerPage);
    const items = parseDeals(xml);
    all = all.concat(items);
    if (items.length < rowsPerPage) break; // no more pages
    page += 1;
  }
  return all;
}

function toYmdString(it) {
  const y = String(it.dealYear || "").padStart(4, "0");
  const m = String(it.dealMonth || "").padStart(2, "0");
  const d = String(it.dealDay || "").padStart(2, "0");
  return `${y}${m}${d}`;
}

function areaBucket(excluUseAr) {
  const n = Number(excluUseAr);
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 10) / 10).toFixed(1); // 0.1㎡ 단위 버킷
}

// 이름 전처리: 공백 제거, 괄호/특수문자 간략화
function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()\[\]{}]/g, "")
    .replace(/-/g, "");
}

async function loadStaticSuggestions() {
  if (!STATIC_SUGGESTIONS_URL) return [];
  if (staticSuggestionsCache) return staticSuggestionsCache;
  staticSuggestionsCache = (async () => {
    try {
      const res = await fetch(STATIC_SUGGESTIONS_URL, { cache: "no-cache" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("static suggestions fetch failed", e);
      return [];
    }
  })();
  return staticSuggestionsCache;
}

// 최근 거래 1건 찾기: 입력한 아파트명과 부분일치하는 최신 데이터
async function findLatestDealByName({ lawdCd, aptName, months = 36 }) {
  const target = normalizeName(aptName);
  const ymList = getLast36Months().slice(0, months);
  for (const ym of ymList) {
    const xml = await fetchDeals(lawdCd, ym, 1, 1000);
    const items = parseDeals(xml);
    // 최신 월부터 내려오며 첫 매칭을 반환
    const found = items.find((it) => normalizeName(it.aptNm || it.아파트).includes(target));
    if (found) return found;
  }
  return null;
}

// 전국(설정된 LAWD_CD_LIST)에서 아파트명 부분일치 검색 → 최신 거래 여러 건을 제안 목록으로 반환
// 참고: 호출량이 많아질 수 있으므로 months, maxResults로 제어
// 특정 월만 강제로 조회하고 싶다면 dealYmd(YYYYMM)를 전달하면 months 대신 그 월 하나만 사용합니다.
async function findSuggestionsByName({ aptName, months = 1, maxResults = 3, lawdList = LAWD_CD_LIST, dealYmd }) {
  const target = normalizeName(aptName);
  if (!target) return [];

  if (STATIC_SUGGESTIONS_URL) {
    const all = await loadStaticSuggestions();
    const filtered = all.filter((it) => {
      const norm = normalizeName(it.aptNm || it.아파트);
      if (!norm.includes(target)) return false;
      if (lawdList && lawdList.length && it.lawdCd && !lawdList.includes(it.lawdCd)) return false;
      return true;
    });
    const sorted = filtered.sort((a, b) => (b.dealYmd || "").localeCompare(a.dealYmd || ""));
    return sorted.slice(0, maxResults);
  }

  if (REALPRICE_CACHE_URL) {
    const url = new URL(REALPRICE_CACHE_URL);
    url.searchParams.set("apt", aptName);
    if (dealYmd) {
      url.searchParams.set("months", "1");
      url.searchParams.set("dealYmd", dealYmd);
    } else {
      url.searchParams.set("months", months.toString());
    }
    url.searchParams.set("max", maxResults.toString());
    if (lawdList && lawdList.length) {
      url.searchParams.set("lawd", lawdList.join(","));
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`cache HTTP ${res.status}`);
    }
    return res.json();
  }

  const ymList = dealYmd ? [dealYmd] : getLastNMonths(months);
  // key: normApt|areaBucket, value: latest deal per 평형
  const latestByArea = new Map();
  const errors = [];
  let shouldStop = false;

  for (const ym of ymList) {
    for (const code of lawdList) {
      try {
        const items = await fetchDealsAllPages(code, ym, 1, 100);
        for (const it of items) {
          const norm = normalizeName(it.aptNm || it.아파트);
          if (!norm.includes(target)) continue;
          const bucket = areaBucket(it.excluUseAr);
          const key = `${norm}|${bucket}`;
          const dealYmd = toYmdString(it);
          const prev = latestByArea.get(key);
          if (!prev || dealYmd > prev.dealYmd) {
            latestByArea.set(key, {
              lawdCd: it.lawdCd,
              aptNm: it.aptNm,
              dealAmount: parseAmount(it.dealAmount),
              dealYmd,
              umdNm: it.umdNm,
              jibun: it.jibun,
              excluUseAr: it.excluUseAr,
              floor: it.floor,
            });
          }
          if (latestByArea.size >= maxResults) {
            shouldStop = true;
            break;
          }
        }
      } catch (e) {
        errors.push(e);
        continue;
      }
      if (shouldStop) break;
    }
    if (shouldStop) break;
  }

  const list = Array.from(latestByArea.values()).sort((a, b) => (b.dealYmd || "").localeCompare(a.dealYmd || ""));
  if (list.length === 0 && errors.length) {
    const first = errors[0];
    const msg = first?.message || first?.toString?.() || "unknown";
    throw new Error(`RTMS 요청 실패: ${msg}`);
  }
  return list.slice(0, maxResults);
}

// 사용 예 (브라우저 콘솔에서):
// REALPRICE_SERVICE_KEY = "발급키";
// findLatestDealByName({ lawdCd: "11680", aptName: "래미안" }).then(console.log);

// 법정동 코드 → 시/구 이름 매핑 (필요 시 추가 확장)
const LAWD_NAME = {
  "11680": "서울시 강남구",
  "11650": "서울시 서초구",
  "11740": "서울시 서초구",
  "11110": "서울시 종로구",
  "11140": "서울시 중구",
  "11170": "서울시 용산구",
  "11200": "서울시 성동구",
  "11215": "서울시 광진구",
  "11230": "서울시 동대문구",
  "11260": "서울시 중랑구",
  "11290": "서울시 성북구",
  "11305": "서울시 강북구",
  "11320": "서울시 도봉구",
  "11350": "서울시 노원구",
  "11380": "서울시 은평구",
  "11410": "서울시 서대문구",
  "11440": "서울시 마포구",
  "11470": "서울시 양천구",
  "11500": "서울시 강서구",
  "11530": "서울시 구로구",
  "11545": "서울시 금천구",
  "11560": "서울시 영등포구",
  "11590": "서울시 동작구",
  "11620": "서울시 관악구",
  "11710": "서울시 송파구",
  "11780": "서울시 강동구",
};

// 강남구 법정동 목록 (주소 fallback용)
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

// 주소 구성 헬퍼 (시/구 + 법정동 + 지번)
function buildAddress(deal) {
  if (!deal) return "";
  const gu = deal.lawdCd && LAWD_NAME[deal.lawdCd] ? LAWD_NAME[deal.lawdCd] : "";
  if (!gu && deal.umdNm && GANGNAM_DONGS.has(deal.umdNm)) {
    const parts = ["서울시 강남구", deal.umdNm, deal.jibun].filter(Boolean);
    return parts.join(" ");
  }
  const parts = [gu, deal.umdNm, deal.jibun].filter(Boolean);
  // Fallback: 시/구가 비어도 동/지번으로 최소한의 주소를 구성
  if (!gu && deal.umdNm) {
    return ["서울시", deal.umdNm, deal.jibun].filter(Boolean).join(" ");
  }
  return parts.join(" ");
}

// 거래금액 숫자 변환 (콤마 제거)
function parseAmount(wonText) {
  return Number((wonText || "").replace(/,/g, "")) || 0;
}

// 모듈 내보내기 (IIFE 전역 attach)
window.RealPrice = {
  setServiceKey: (key) => {
    REALPRICE_SERVICE_KEY = key;
  },
  setProxyUrl: (url) => {
    REALPRICE_PROXY_URL = url || "";
  },
  setCacheUrl: (url) => {
    REALPRICE_CACHE_URL = url || "";
  },
  setLawdList: (list) => {
    LAWD_CD_LIST = Array.isArray(list) ? list : LAWD_CD_LIST;
  },
  isProxyEnabled: () => Boolean(REALPRICE_PROXY_URL),
  findLatestDealByName,
  findSuggestionsByName,
  buildAddress,
  parseAmount,
  getLast36Months,
  getLastNMonths,
};

// cd /Users/antaehee/Desktop/real_estate/web-sim
// python3 -m http.server 3000   # “Serving HTTP on … 3000” 문구 확인
