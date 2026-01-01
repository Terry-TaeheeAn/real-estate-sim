import requests
import xmltodict
import pandas as pd
from datetime import datetime
import time
import os
import shutil

# 1. data.go.kr 미리보기 URL에서 복사한 serviceKey 값 그대로
SERVICE_KEY = "eaddd64dcfcfedb8fca716ceed60a4e30fc1f2e5e29941158d60c155e20912bd"

# 2. LAWD_CD_LIST : 시군구 코드 목록 (서울 + 부산 예시)
LAWD_CD_LIST = [
    # 서울특별시
    "11110",  # 종로구
    "11140",  # 중구
    "11170",  # 용산구
    "11200",  # 성동구
    "11215",  # 광진구
    "11230",  # 동대문구
    "11260",  # 중랑구
    "11290",  # 성북구
    "11305",  # 강북구
    "11320",  # 도봉구
    "11350",  # 노원구
    "11380",  # 은평구
    "11410",  # 서대문구
    "11440",  # 마포구
    "11470",  # 양천구
    "11500",  # 강서구
    "11530",  # 구로구
    "11545",  # 금천구
    "11560",  # 영등포구
    "11590",  # 동작구
    "11620",  # 관악구
    "11650",  # 서초구
    "11680",  # 강남구
    "11710",  # 송파구
    "11740",  # 강동구

    # 부산광역시
    "26110",  # 중구
    "26140",  # 서구
    "26170",  # 동구
    "26200",  # 영도구
    "26230",  # 부산진구
    "26260",  # 동래구
    "26290",  # 남구
    "26320",  # 북구
    "26350",  # 해운대구
    "26380",  # 사하구
    "26410",  # 금정구
    "26440",  # 강서구
    "26470",  # 연제구
    "26500",  # 수영구
    "26530",  # 사상구
    "26710",  # 기장군
]

# 3. 최근 12개월(1년) DEAL_YMD 리스트 생성
def get_last_12_months():
    today = datetime.today()
    months = []
    for i in range(12):
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        months.append(f"{year}{month:02d}")  # 예: 202501
    return sorted(set(months))

DEAL_YMD_LIST = get_last_12_months()

# 4. 국토부 "아파트 매매 실거래 자료" API 엔드포인트 (Dev 아님!)
BASE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"


def fetch_one(lawd_cd, deal_ymd, page_no=1, num_of_rows=1000):
    """
    LAWD_CD + DEAL_YMD 조합에 대해 한 페이지 호출
    """
    params = {
        "serviceKey": SERVICE_KEY,
        "LAWD_CD": lawd_cd,
        "DEAL_YMD": deal_ymd,
        "pageNo": page_no,
        "numOfRows": num_of_rows,
    }

    res = requests.get(BASE_URL, params=params, timeout=10)

    if not res.ok:
        print("HTTP 상태코드:", res.status_code)
        print("요청 URL:", res.url)
        print("응답 상위 300자:\n", res.text[:300])
        res.raise_for_status()

    data_dict = xmltodict.parse(res.text)
    return data_dict


def extract_items(data_dict):
    """
    XML dict에서 items.item 리스트만 추출
    """
    try:
        body = data_dict["response"]["body"]
        if "items" not in body or body["items"] is None:
            return []
        items = body["items"]["item"]
        return items if isinstance(items, list) else [items]
    except Exception:
        return []


def main():
    all_rows = []

    print("조회 DEAL_YMD_LIST:", DEAL_YMD_LIST)
    print("조회 LAWD_CD 개수:", len(LAWD_CD_LIST))

    for lawd_cd in LAWD_CD_LIST:
        for deal_ymd in DEAL_YMD_LIST:
            print(f"[요청] LAWD_CD={lawd_cd}, DEAL_YMD={deal_ymd}")
            page_no = 1

            while True:
                try:
                    data_dict = fetch_one(lawd_cd, deal_ymd, page_no=page_no)
                    items = extract_items(data_dict)

                    if not items:
                        break

                    for it in items:
                        it["LAWD_CD"] = lawd_cd
                        it["DEAL_YMD"] = deal_ymd
                        all_rows.append(it)

                    page_no += 1
                    time.sleep(0.2)

                except Exception as e:
                    print(f"[에러] LAWD_CD={lawd_cd}, DEAL_YMD={deal_ymd}, page={page_no}: {e}")
                    break

    if not all_rows:
        print("가져온 데이터가 없습니다. (serviceKey / 활용신청 / 기간 / 지역 다시 확인)")
        return

    df = pd.DataFrame(all_rows)

    preferred_cols = [
        "LAWD_CD",
        "DEAL_YMD",
        "법정동",
        "아파트",
        "전용면적",
        "층",
        "거래금액",
        "년",
        "월",
        "일",
    ]
    cols = [c for c in preferred_cols if c in df.columns]
    df = df[cols + [c for c in df.columns if c not in cols]]

    for col in ["거래금액", "전용면적"]:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .str.replace(",", "", regex=False)
                .str.strip()
            )
            df[col] = pd.to_numeric(df[col], errors="coerce")

    output_file = "실거래가_최근1년_서울부산_예시.xlsx"
    df.to_excel(output_file, index=False)
    print(f"완료: {output_file} 저장 (총 {len(df)}행)")


def git_push():
    try:
        # 현재 디렉토리 확인
        current_dir = os.getcwd()
        print("현재 디렉토리:", current_dir)

        # web-sim 디렉토리 복사
        src = os.path.join(current_dir, "web-sim")
        dst = os.path.join(current_dir, "push", "web-sim")
        shutil.copytree(src, dst, dirs_exist_ok=True)
        print("web-sim 디렉토리 복사 완료")

        # Git 초기화 및 원격 저장소 추가
        os.system("git init")
        os.system('git remote add origin https://github.com/<아이디>/real-estate-sim.git')

        # 변경 사항 추가 및 커밋
        os.system("git add .")
        os.system('git commit -m "Add web sim"')

        # 원격 저장소에 푸시
        os.system("git push -u origin main")
        print("푸시 완료")

    except Exception as e:
        print("오류 발생:", e)


if __name__ == "__main__":
    main()
    git_push()
