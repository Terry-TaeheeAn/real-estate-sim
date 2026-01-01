import os
import json
from datetime import datetime
from flask import Flask, request, Response, jsonify
import requests
import xml.etree.ElementTree as ET

SERVICE_KEY = os.environ.get("REALPRICE_SERVICE_KEY")
ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
CACHE_PATH = os.environ.get("REALPRICE_CACHE_PATH", os.path.join(os.path.dirname(__file__), "cache.json"))

def create_app():
    app = Flask(__name__)

    @app.after_request
    def add_cors_headers(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET,OPTIONS"
        return resp

    @app.route("/api/rtms", methods=["OPTIONS"])
    def rtms_options():
        return ("", 204)

    def _health_payload():
        return {"ok": True, "serviceKeyNeeded": not bool(SERVICE_KEY)}

    @app.route("/health", methods=["GET"])
    def health():
        return _health_payload()

    @app.route("/api/rtms/health", methods=["GET"])
    def rtms_health():
        return _health_payload()

    def _load_cache():
        if not os.path.exists(CACHE_PATH):
            return []
        try:
            with open(CACHE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save_cache(items):
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False)

    def _last_n_months(n):
        now = datetime.today()
        year, month = now.year, now.month
        arr = []
        for _ in range(max(1, n)):
            arr.append(f"{year}{month:02d}")
            month -= 1
            if month == 0:
                month = 12
                year -= 1
        return arr

    def _normalize(name: str) -> str:
        return (
            (name or "")
            .lower()
            .replace(" ", "")
            .replace("-", "")
            .replace("(", "")
            .replace(")", "")
        )

    def _parse_items(xml_text):
        root = ET.fromstring(xml_text)
        items = []
        for item in root.findall(".//item"):
            def get(tag):
                el = item.find(tag)
                return el.text.strip() if el is not None and el.text else ""

            deal_amount_raw = get("거래금액") or get("dealAmount")
            deal_amount = int(deal_amount_raw.replace(",", "")) if deal_amount_raw else 0

            year = get("년") or ""
            month = (get("월") or "").zfill(2)
            day = (get("일") or "").zfill(2)
            deal_ymd = get("DEAL_YMD") or (f"{year}{month}{day}" if year else "")

            items.append({
                "lawdCd": get("LAWD_CD"),
                "dealYmd": deal_ymd,
                "aptNm": get("아파트") or get("aptNm"),
                "umdNm": get("법정동") or get("umdNm"),
                "jibun": get("지번") or get("jibun"),
                "dealAmount": deal_amount,
                "excluUseAr": get("전용면적") or get("excluUseAr"),
                "floor": get("층") or get("floor"),
            })
        return items

    def _fetch_rtms(lawd_cd, deal_ymd, page_no=1, num_rows=200):
        params = {
            "serviceKey": SERVICE_KEY,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": deal_ymd,
            "pageNo": str(page_no),
            "numOfRows": str(num_rows),
        }
        upstream = requests.get(ENDPOINT, params=params, timeout=10)
        upstream.raise_for_status()
        return upstream.text

    def _area_bucket(exclu_use_ar):
        try:
            n = float(exclu_use_ar)
        except (TypeError, ValueError):
            return ""
        return f"{round(n, 1):.1f}"

    def _area_value(exclu_use_ar):
        try:
            return float(exclu_use_ar)
        except (TypeError, ValueError):
            return None

    @app.route("/api/cache/points", methods=["GET"])
    def cache_points():
        months = int(request.args.get("months", 3) or 3)
        max_results = int(request.args.get("max", 500) or 500)
        lawd_filter = request.args.get("lawd")

        allowed_ym = set(_last_n_months(max(1, months)))
        cache = _load_cache()
        latest_by_apt = {}

        for it in cache:
            ym = str(it.get("dealYmd", ""))[:6]
            if ym and ym not in allowed_ym:
                continue
            if lawd_filter:
                allowed = {c.strip() for c in lawd_filter.split(",") if c.strip()}
                lawd_val = it.get("lawdCd")
                if lawd_val and lawd_val not in allowed:
                    continue
            apt = (it.get("aptNm") or "").strip()
            if not apt:
                continue
            key = apt
            prev = latest_by_apt.get(key)
            if not prev or str(it.get("dealYmd", "")) > str(prev.get("dealYmd", "")):
                latest_by_apt[key] = {
                    "aptNm": apt,
                    "lawdCd": it.get("lawdCd"),
                    "umdNm": it.get("umdNm"),
                    "jibun": it.get("jibun"),
                    "dealYmd": it.get("dealYmd"),
                    "excluUseAr": it.get("excluUseAr"),
                }

        result = sorted(latest_by_apt.values(), key=lambda x: str(x.get("dealYmd", "")), reverse=True)
        return jsonify(result[:max_results])

    @app.route("/api/cache/suggestions", methods=["GET"])
    def cache_suggestions():
        apt = request.args.get("apt", "").strip()
        months = int(request.args.get("months", 1) or 1)
        max_results = int(request.args.get("max", 3) or 3)
        lawd_filter = request.args.get("lawd")
        deal_ymd = request.args.get("dealYmd")

        area_flag = (request.args.get("area") or "").strip()  # le85 | gt85
        min_area = request.args.get("minArea")
        max_area = request.args.get("maxArea")

        # Normalize area filters
        try:
            min_area_val = float(min_area) if min_area else None
        except ValueError:
            return ("invalid minArea", 400)
        try:
            max_area_val = float(max_area) if max_area else None
        except ValueError:
            return ("invalid maxArea", 400)

        if area_flag == "le85" and max_area_val is None:
            max_area_val = 85.0
        if area_flag == "gt85" and min_area_val is None:
            min_area_val = 85.0000001  # strict 초과

        if not apt:
            return ("missing apt", 400)

        allowed_ym = {deal_ymd} if deal_ymd else set(_last_n_months(max(1, months)))
        target = _normalize(apt)
        cache = _load_cache()

        latest_by_key = {}

        for it in cache:
            ym = str(it.get("dealYmd", ""))[:6]
            if ym and ym not in allowed_ym:
                continue
            if lawd_filter:
                allowed = {c.strip() for c in lawd_filter.split(",") if c.strip()}
                lawd_val = it.get("lawdCd")
                if lawd_val and lawd_val not in allowed:
                    continue
            area_val = _area_value(it.get("excluUseAr"))
            if min_area_val is not None and (area_val is None or area_val < min_area_val):
                continue
            if max_area_val is not None and (area_val is None or area_val > max_area_val):
                continue
            norm = _normalize(it.get("aptNm", ""))
            if not norm or target not in norm:
                continue
            bucket = _area_bucket(it.get("excluUseAr"))
            key = f"{norm}|{bucket}"
            prev = latest_by_key.get(key)
            if not prev or str(it.get("dealYmd", "")) > str(prev.get("dealYmd", "")):
                latest_by_key[key] = it

        result = sorted(latest_by_key.values(), key=lambda x: str(x.get("dealYmd", "")), reverse=True)
        return jsonify(result[:max_results])

    @app.route("/api/cache/refresh", methods=["POST"])
    def cache_refresh():
        if not SERVICE_KEY:
            return ("REALPRICE_SERVICE_KEY not set", 500)

        payload = request.get_json(silent=True) or {}
        lawd_list = payload.get("lawd") or request.form.getlist("lawd")
        if not lawd_list:
            raw = request.args.get("lawd", "")
            lawd_list = [c.strip() for c in raw.split(",") if c.strip()] if raw else ["11680"]
        if isinstance(lawd_list, str):
            lawd_list = [lawd_list]

        months = int(payload.get("months", request.args.get("months", 1) or 1))
        pages = int(payload.get("pages", request.args.get("pages", 1) or 1))
        rows = int(payload.get("rows", request.args.get("rows", 200) or 200))

        ym_list = _last_n_months(max(1, months))
        new_items = []

        for ym in ym_list:
            for lawd in lawd_list:
                for page in range(1, pages + 1):
                    try:
                        xml = _fetch_rtms(lawd, ym, page, rows)
                        parsed = _parse_items(xml)
                        new_items.extend(parsed)
                        if len(parsed) < rows:
                            break
                    except Exception as e:
                        return (f"fetch failed for {lawd} {ym} page {page}: {e}", 502)

        cache = _load_cache()
        merged = {f"{it.get('lawdCd')}|{_normalize(it.get('aptNm'))}|{it.get('excluUseAr')}|{it.get('dealYmd')}|{it.get('floor')}": it for it in cache}
        for it in new_items:
            key = f"{it.get('lawdCd')}|{_normalize(it.get('aptNm'))}|{it.get('excluUseAr')}|{it.get('dealYmd')}|{it.get('floor')}"
            merged[key] = it

        merged_list = list(merged.values())
        _save_cache(merged_list)

        return jsonify({
            "fetched": len(new_items),
            "cacheSize": len(merged_list),
            "months": ym_list,
            "lawd": lawd_list,
            "cachePath": CACHE_PATH,
        })

    @app.route("/api/rtms", methods=["GET"])  # lawdCd, dealYmd, pageNo?, numOfRows?
    def rtms_proxy():
        if not SERVICE_KEY:
            return ("REALPRICE_SERVICE_KEY not set", 500)

        lawd_cd = request.args.get("lawdCd") or request.args.get("LAWD_CD")
        deal_ymd = request.args.get("dealYmd") or request.args.get("DEAL_YMD")
        page_no = request.args.get("pageNo", "1")
        num_of_rows = request.args.get("numOfRows", "1000")

        if not lawd_cd or not deal_ymd:
            return ("missing lawdCd/dealYmd", 400)

        params = {
            "serviceKey": SERVICE_KEY,
            "LAWD_CD": lawd_cd,
            "DEAL_YMD": deal_ymd,
            "pageNo": page_no,
            "numOfRows": num_of_rows,
        }

        try:
            upstream = requests.get(ENDPOINT, params=params, timeout=10)
        except requests.RequestException as e:
            return (f"upstream error: {e}", 502)

        return Response(upstream.content, status=upstream.status_code, content_type=upstream.headers.get("Content-Type", "application/xml"))

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
