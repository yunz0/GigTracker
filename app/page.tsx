'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 날짜 문자열에서 기호를 다 빼고 YYYYMMDD 숫자로 바꿔서 안전하게 비교하는 함수
function getNormalizedDate(dateStr: string) {
  if (!dateStr) return ''
  // 숫자만 남기고 모두 제거 (예: "2026.07.18" 또는 "2026-07-18" -> "20260718")
  const clean = dateStr.replace(/[^0-9]/g, '')
  return clean
}

function getDynamicStatus(startDate: string, endDate: string) {
  const cleanStart = getNormalizedDate(startDate)
  const cleanEnd = getNormalizedDate(endDate)

  if (!cleanStart || !cleanEnd) return '정보 없음'

  // 오늘 날짜를 YYYYMMDD 숫자로 구하기 (예: 20260919)
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const todayNum = `${year}${month}${day}`

  if (todayNum < cleanStart) return '공연 예정'
  if (todayNum > cleanEnd) return '공연 종료'
  return '공연중'
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<any | null>(null) // 상세 모달 상태
  const [isZoomed, setIsZoomed] = useState(false) // 포스터 확대 보기 상태

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    try {
      const formattedQuery = `%${query.trim().replace(/\s+/g, '%')}%`

      // 공연 제목(prfnm) 혹은 출연진(prfcast) 중 하나라도 검색어가 포함되면 가져오도록 .or() 조건 적용
      const { data, error } = await supabase
        .from('performances')
        .select('*')
        .or(`prfnm.ilike.${formattedQuery},prfcast.ilike.${formattedQuery}`)
        .limit(20)

      if (error) throw error
      setResults(data || [])
    } catch (error) {
      console.error('검색 에러:', error)
    } finally {
      setLoading(false)
    }
  }

  const getSearchPeriodText = () => {
    const today = new Date()
    const future = new Date()
    future.setMonth(today.getMonth() + 3)

    const formatDate = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}.${month}.${day}`
    }

    return `${formatDate(today)} ~ ${formatDate(future)}`
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-12 relative">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">출연자명으로 공연 검색</h1>
        <p className="text-gray-600 text-center mb-8">📅 조회 기간: {getSearchPeriodText()} &nbsp;|&nbsp; 🏛️ KOPIS(공연예술통합전산망) 등록 기준</p>

        {/* 검색 입력폼 */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="아티스트 이름 입력"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? '검색 중...' : '검색'}
          </button>
        </form>

        {/* 검색 결과 리스트 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((item) => (
            <div
              key={item.mt20id}
              onClick={() => {
                setSelectedItem(item)
                setIsZoomed(false) // 모달 열 때 확대 상태 초기화
              }}
              className="bg-white p-4 rounded-xl shadow border border-gray-100 flex gap-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition"
            >
              {item.poster && (
                <img src={item.poster} alt={item.prfnm} className="w-24 h-32 object-cover rounded shadow-sm" />
              )}
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-lg text-gray-900 mb-1 line-clamp-1">{item.prfnm}</h3>
                  <p className="text-sm text-gray-600 mb-1">장소: {item.fcltynm}</p>
                  <p className="text-sm text-gray-500 mb-1">기간: {item.prfpdfrom} ~ {item.prfenddate}</p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-blue-600 font-medium line-clamp-1 flex-1">출연: {item.prfcast || '정보 없음'}</p>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full shrink-0 ml-2">
                    {getDynamicStatus(item.prfpdfrom, item.prfenddate)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {results.length === 0 && !loading && query && (
          <p className="text-center text-gray-500 mt-12">검색 결과가 없습니다.</p>
        )}
      </div>

      {/* 상세 정보 팝업(모달) */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold"
            >
              ✕
            </button>

            <div className="flex gap-4 mb-4">
              {/* 포스터 클릭 시 확대 상태를 true로 변경 */}
              {selectedItem.poster && (
                <div className="relative group cursor-pointer" onClick={() => setIsZoomed(true)}>
                  <img
                    src={selectedItem.poster}
                    alt={selectedItem.prfnm}
                    className="w-32 h-44 object-cover rounded-lg shadow hover:opacity-90 transition"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition rounded-lg text-white text-xs font-semibold">
                    🔍 크게 보기
                  </div>
                </div>
              )}
              <div className="flex-1">
                <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-full mb-2">
                  {selectedItem.genrenm || '공연'}
                </span>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{selectedItem.prfnm}</h2>
                <p className="text-sm text-gray-600 mb-1">🏛️ 장소: {selectedItem.fcltynm}</p>
                <p className="text-sm text-gray-600 mb-1">📅 기간: {selectedItem.prfpdfrom} ~ {selectedItem.prfenddate}</p>
                <p className="text-sm text-gray-600">
                  ⚡ 상태: <span className="font-semibold text-blue-600">{getDynamicStatus(selectedItem.prfpdfrom, selectedItem.prfenddate)}</span>
                </p>
              </div>
            </div>

            <div className="border-t pt-4 mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-1">출연진</h4>
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{selectedItem.prfcast || '출연진 정보가 없습니다.'}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedItem(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 포스터 원본 크게 보기 라이트박스 모달 */}
      {isZoomed && selectedItem && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60] cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <img
              src={selectedItem.poster}
              alt={selectedItem.prfnm}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <p className="text-center text-white/70 text-sm mt-3">화면을 클릭하면 원래 창으로 돌아갑니다.</p>
          </div>
        </div>
      )}
    </main>
  )
}
