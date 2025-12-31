import os
import json
from datetime import datetime
from flask import Flask, request, Response, jsonify
import requests

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

    def _area_bucket(exclu_use_ar):
        try:
            n = float(exclu_use_ar)
        except (TypeError, ValueError):
            return ""
        return f"{round(n, 1):.1f}"

    @app.route("/api/cache/suggestions", methods=["GET"])
    def cache_suggestions():
        apt = request.args.get("apt", "").strip()
        months = int(request.args.get("months", 1) or 1)
        max_results = int(request.args.get("max", 3) or 3)
        lawd_filter = request.args.get("lawd")
        deal_ymd = request.args.get("dealYmd")

        if not apt:
            return ("missing apt", 400)

        allowed_ym = {deal_ymd} if deal_ymd else set(_last_n_months(max(1, months)))
        target = _normalize(apt)
        cache = _load_cache()

        latest_by_key = {}

        for it in cache:
            ym = str(it.get("dealYmd", ""))[:6]
            if ym not in allowed_ym:
                continue
            if lawd_filter:
                allowed = {c.strip() for c in lawd_filter.split(",") if c.strip()}
                if it.get("lawdCd") not in allowed:
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
