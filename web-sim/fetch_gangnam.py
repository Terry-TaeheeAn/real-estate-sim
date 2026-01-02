import json
import datetime
import xml.etree.ElementTree as ET
import requests
import urllib3
from typing import List, Dict

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

KEY = "3b59d6fb1763b6431a0aa52d340071a44c766eddea6d25f58512c9379f8f016a"
LAWDCODE = "11680"
MONTHS = 12
RTMS = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"


def last_n_months(n: int) -> List[str]:
    today = datetime.date.today().replace(day=1)
    out = []
    for i in range(n):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        out.append(f"{y}{m:02d}")
    return out


def fetch_month(ym: str) -> str:
    params = {
        "serviceKey": KEY,
        "LAWD_CD": LAWDCODE,
        "DEAL_YMD": ym,
        "pageNo": "1",
        "numOfRows": "2000",
    }
    r = requests.get(RTMS, params=params, timeout=60, verify=False)
    r.raise_for_status()
    return r.text


def parse_items(xml_text: str) -> List[Dict]:
    root = ET.fromstring(xml_text)
    items = []
    for item in root.findall(".//item"):
        def get(tag: str) -> str:
            el = item.find(tag)
            return el.text.strip() if el is not None and el.text else ""

        amt_raw = get("거래금액") or get("dealAmount")
        amt = int(amt_raw.replace(",", "")) if amt_raw else 0
        year = get("dealYear") or get("년") or ""
        month = (get("dealMonth") or get("월") or "").zfill(2)
        day = (get("dealDay") or get("일") or "").zfill(2)
        deal_ymd = get("DEAL_YMD") or (f"{year}{month}{day}" if year else "")
        items.append(
            {
                "lawdCd": get("sggCd") or get("LAWD_CD"),
                "dealYmd": deal_ymd,
                "aptNm": get("아파트") or get("aptNm"),
                "umdNm": get("법정동") or get("umdNm"),
                "jibun": get("지번") or get("jibun"),
                "dealAmount": amt,
                "excluUseAr": get("전용면적") or get("excluUseAr"),
                "floor": get("층") or get("floor"),
            }
        )
    return items


def area_bucket(v: str) -> str:
    try:
        n = float(v)
    except Exception:
        return ""
    return f"{round(n, 1):.1f}"


def build_files():
    all_items: List[Dict] = []
    for ym in last_n_months(MONTHS):
        xml = fetch_month(ym)
        items = parse_items(xml)
        all_items.extend(items)
        print(f"fetched {ym} batch {len(items)} total {len(all_items)}")

    latest_by_apt: Dict[str, Dict] = {}
    for it in all_items:
        key = (it.get("aptNm") or "").strip()
        if not key:
            continue
        prev = latest_by_apt.get(key)
        if not prev or str(it.get("dealYmd", "")) > str(prev.get("dealYmd", "")):
            latest_by_apt[key] = {k: it.get(k) for k in ["aptNm", "lawdCd", "umdNm", "jibun", "dealYmd", "excluUseAr"]}

    points = sorted(latest_by_apt.values(), key=lambda x: str(x.get("dealYmd", "")), reverse=True)
    with open("web-sim/points.json", "w", encoding="utf-8") as f:
        json.dump(points, f, ensure_ascii=False)
    print("points", len(points))

    latest_by_key: Dict[str, Dict] = {}
    for it in all_items:
        norm = (it.get("aptNm") or "").strip()
        if not norm:
            continue
        bucket = area_bucket(it.get("excluUseAr"))
        key = f"{norm}|{bucket}"
        prev = latest_by_key.get(key)
        if not prev or str(it.get("dealYmd", "")) > str(prev.get("dealYmd", "")):
            latest_by_key[key] = it

    suggestions = sorted(latest_by_key.values(), key=lambda x: str(x.get("dealYmd", "")), reverse=True)
    with open("web-sim/suggestions.json", "w", encoding="utf-8") as f:
        json.dump(suggestions, f, ensure_ascii=False)
    print("suggestions", len(suggestions))


if __name__ == "__main__":
    build_files()
