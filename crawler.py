import os
import time
import requests
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from supabase import create_client, Client
from dotenv import load_dotenv

# 1. 환경 변수 로드 (.env.local)
load_dotenv(".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
KOPIS_API_KEY = os.getenv("KOPIS_API_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY or not KOPIS_API_KEY:
    print("❌ 오류: .env.local 파일에 Supabase 또는 KOPIS 설정이 누락되었습니다.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

def cleanup_past_performances():
    """오늘 날짜 기준으로 이미 종료된 공연은 DB에서 삭제합니다."""
    today_str = datetime.now().strftime("%Y%m%d")
    print(f"🧹 [청소 중] {today_str} 이전 종료된 과거 공연 데이터를 정리합니다...")
    
    try:
        supabase.table("performances").delete().lt("prfenddate", today_str).execute()
        print("✨ 과거 공연 정리가 완료되었습니다.")
    except Exception as e:
        print(f"⚠️ 과거 공연 정리 중 오류 발생 (무시하고 진행): {e}")

def fetch_with_retry(url, params, max_retries=3):
    """API 요청이 실패(400 등)할 경우 재시도하는 안전 함수"""
    for attempt in range(max_retries):
        try:
            response = requests.get(url, params=params, timeout=10)
            if response.status_code == 200:
                return response
            elif response.status_code == 400:
                print(f"⚠️ API 400 에러 발생, 재시도 중... ({attempt + 1}/{max_retries})")
                time.sleep(1)
        except Exception as e:
            print(f"⚠️ 요청 예외 발생: {e}, 재시도 중...")
            time.sleep(1)
    return None

def fetch_and_upsert_all_performances():
    """KOPIS에서 향후 3개월(90일) 간의 공연을 안전하게 수집하여 DB에 Upsert 합니다."""
    today = datetime.now()
    today_str = today.strftime("%Y%m%d")
    
    # 💡 3개월(90일) 치로 기간 설정
    future_date = today + timedelta(days=90)
    future_str = future_date.strftime("%Y%m%d")
    
    cpage = 1
    rows_per_page = 100
    total_inserted = 0

    print(f"📡 KOPIS 공연 수집 시작 ({today_str} ~ {future_str}, 3개월간)...")

    while True:
        list_url = "http://www.kopis.or.kr/openApi/restful/pblprfr"
        params = {
            "service": KOPIS_API_KEY,
            "stdate": today_str,
            "eddate": future_str,
            "cpage": cpage,
            "rows": rows_per_page
        }

        response = fetch_with_retry(list_url, params)
        if not response:
            print(f"❌ KOPIS API 목록 요청이 최종 실패했습니다. (페이지: {cpage})")
            break

        soup = BeautifulSoup(response.text, 'xml')
        box_list = soup.find_all('db')

        if not box_list:
            break

        print(f"--- [페이지 {cpage}] {len(box_list)}개의 공연 발견. 상세 정보 수집 중...")

        for box in box_list:
            mt20id = box.find('mt20id').text
            prfnm = box.find('prfnm').text
            prfstate = box.find('prfstate').text if box.find('prfstate') else ""
            
            # 상세 정보 API 호출
            detail_url = f"http://www.kopis.or.kr/openApi/restful/pblprfr/{mt20id}"
            detail_params = {"service": KOPIS_API_KEY}
            detail_res = fetch_with_retry(detail_url, detail_params)
            
            time.sleep(0.15)  # 서버 부하 방지 딜레이

            if not detail_res or detail_res.status_code != 200:
                continue

            detail_soup = BeautifulSoup(detail_res.text, 'xml')
            
            prfpdfrom = detail_soup.find('prfpdfrom').text if detail_soup.find('prfpdfrom') else ""
            prfenddate = detail_soup.find('prfenddate').text if detail_soup.find('prfenddate') else ""
            fcltynm = detail_soup.find('fcltynm').text if detail_soup.find('fcltynm') else ""
            prfcast = detail_soup.find('prfcast').text if detail_soup.find('prfcast') else ""
            poster = detail_soup.find('poster').text if detail_soup.find('poster') else ""
            genrenm = detail_soup.find('genrenm').text if detail_soup.find('genrenm') else ""

            performance_data = {
                "mt20id": mt20id,
                "prfnm": prfnm,
                "prfpdfrom": prfpdfrom,
                "prfenddate": prfenddate,
                "fcltynm": fcltynm,
                "prfcast": prfcast,
                "poster": poster,
                "genrenm": genrenm,
                "prfstate": prfstate
            }

            try:
                supabase.table("performances").upsert(performance_data, on_conflict="mt20id").execute()
                total_inserted += 1
            except Exception as e:
                print(f"⚠️ DB 저장 실패 ({prfnm}) | 상세 에러: {repr(e)}")

        cpage += 1

    print(f"🎉 총 {total_inserted}개의 공연 데이터 동기화 완료!")

if __name__ == "__main__":
    cleanup_past_performances()
    fetch_and_upsert_all_performances()