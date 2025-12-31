import argparse
import json
import os
import time
from datetime import datetime
import requests
import xml.etree.ElementTree as ET

SERVICE_KEY = os.environ.get("REALPRICE_SERVICE_KEY")
ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"


def month_list(months):
    today = datetime.today()
    year, month = today.year, today.month
    out = []
    for _ in range(months):
        out.append(f"{year}{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return out


def fetch_page(lawd_cd, deal_ymd, page_no=1, num_rows=200):
    if not SERVICE_KEY:
        raise RuntimeError("REALPRICE_SERVICE_KEY not set")
    params = {
        "serviceKey": SERVICE_KEY,
        "LAWD_CD": lawd_cd,
        "DEAL_YMD": deal_ymd,
        "pageNo": page_no,
        "numOfRows": num_rows,
    }
    resp = requests.get(ENDPOINT, params=params, timeout=10)
    resp.raise_for_status()
    return resp.text


def parse_items(xml_text):
    root = ET.fromstring(xml_text)
    items = []
    for item in root.findall(".//item"):
        def get(tag):
            el = item.find(tag)
            return el.text.strip() if el is not None and el.text else ""
        items.append({
            "lawdCd": get("LAWD_CD"),
            "dealYmd": f"{get('년')}{get('월').zfill(2)}{get('일').zfill(2)}" if get("년") else get("DEAL_YMD"),
            "aptNm": get("아파트") or get("aptNm"),
            "umdNm": get("법정동") or get("umdNm"),
            "jibun": get("지번") or get("jibun"),
            "dealAmount": int((get("거래금액") or get("dealAmount")).replace(",", "")) if (get("거래금액") or get("dealAmount")) else 0,
            "excluUseAr": get("전용면적") or get("excluUseAr"),
            "floor": get("층") or get("floor"),
        })
    return items


def fetch_all(lawd_list, months, max_pages=1, rows_per_page=200, delay=0):
    ym_list = month_list(months)
    all_items = []
    for ym in ym_list:
        for lawd in lawd_list:
            for page in range(1, max_pages + 1):
                try:
                    xml = fetch_page(lawd, ym, page, rows_per_page)
                    items = parse_items(xml)
                    all_items.extend(items)
                    if len(items) < rows_per_page:
                        break
                except Exception as e:
                    print(f"[warn] {lawd} {ym} page {page} failed: {e}")
                    break
                if delay:
                    time.sleep(delay)
    return all_items


def main():
    parser = argparse.ArgumentParser(description="Fetch RTMS data to local cache")
    parser.add_argument("--lawd", nargs="*", default=["11680"], help="LAWD_CD list (default: 11680)")
    parser.add_argument("--months", type=int, default=1, help="Number of recent months (default: 1)")
    parser.add_argument("--out", default="cache.json", help="Output JSON path (default: cache.json)")
    parser.add_argument("--pages", type=int, default=1, help="Pages per month (default: 1)")
    parser.add_argument("--rows", type=int, default=200, help="Rows per page (default: 200)")
    parser.add_argument("--delay", type=float, default=0, help="Delay seconds between pages (default: 0)")
    args = parser.parse_args()

    items = fetch_all(args.lawd, args.months, max_pages=args.pages, rows_per_page=args.rows, delay=args.delay)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False)
    print(f"saved {len(items)} records to {args.out}")


if __name__ == "__main__":
    main()
