#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# 캐시/프록시 서버 (5001)와 프런트(http.server 3000)를 함께 실행
# 종료: Ctrl+C

PORT=${PORT:-5001}
python3 realprice_proxy.py &
API_PID=$!

python3 -m http.server 3000 &
WEB_PID=$!

echo "proxy pid=$API_PID (http://localhost:${PORT})"
echo "web   pid=$WEB_PID (http://localhost:3000)"

tap_cleanup() {
  kill $API_PID $WEB_PID 2>/dev/null || true
}
trap tap_cleanup INT TERM
wait
