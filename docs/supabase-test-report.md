# Supabase 연동 통합 테스트 리포트

- **작성일:** 2026-05-07
- **브랜치:** `feat/supabase-integration`
- **PR:** https://github.com/lgh-dacon/my-cosmic-level/pull/1
- **테스트 스크립트:** `scripts/test-supabase.mjs`

---

## 테스트 환경

| 항목 | 값 |
|------|-----|
| Supabase 프로젝트 | `srqfpftvimlzlfzgyndh.supabase.co` |
| 인증 방식 | 익명 로그인 (`signInAnonymously`) |
| 대상 테이블 | `profiles`, `ex_photos` |
| 실행 방법 | `node scripts/test-supabase.mjs` |

---

## 테스트 결과 (5/5 통과)

| # | 시나리오 | 액션 | 기대값 | 실제값 | 결과 |
|---|----------|------|--------|--------|------|
| T1 | 익명 로그인 | `POST /auth/v1/signup` | HTTP 200 + access_token | HTTP 200 \| token: 있음 | ✅ PASS |
| T2 | profiles 생성 | `POST /rest/v1/profiles` | user_id로 row 존재 | id: fbb79bb7… \| nick: 탐사대원_FBB79B | ✅ PASS |
| T3 | ex_photos INSERT | zodiac_id 포함 1건 저장 | HTTP 201 + zodiac_id=cancer | HTTP 201 \| zodiac_id: cancer | ✅ PASS |
| T4 | 사진 3개 연속 INSERT | batch INSERT 3건 | HTTP 201 + row 3개 반환 | HTTP 201 \| 반환 row: 3개 | ✅ PASS |
| T5 | SELECT 조회 | `GET /rest/v1/ex_photos` | 이번 세션 삽입 4개 조회 | 전체 4행 \| 이번 세션 4개 확인 | ✅ PASS |

---

## 이번 세션 저장된 데이터

| 파일명 | city | zodiac_id |
|--------|------|-----------|
| test_single.jpg | 서울 | cancer |
| photo_a.jpg | 부산 | taurus |
| photo_b.jpg | 제주 | gemini |
| photo_c.jpg | 도쿄 | leo |

---

## 데이터 흐름 검증

```
앱 시작
  └→ POST /auth/v1/signup          → user_id 발급 (익명)
  └→ POST /rest/v1/profiles        → profiles row 생성 (auth 트리거 또는 클라이언트 upsert)
  └→ GET  /rest/v1/ex_photos       → 기존 사진 로드 (재방문 시 복원)

사진 업로드 (LAUNCH)
  └→ POST /rest/v1/ex_photos       → 사진 메타데이터 INSERT (zodiac_id = null)
  └→ PATCH /rest/v1/ex_photos      → zodiac_id UPDATE (별자리 결정 후)
```

---

## T2 비고 — profiles 닉네임 동작

`signInAnonymously` 직후 Supabase auth 트리거(`on_auth_user_created`)가 자동으로
`탐사대원_XXXXXX` 닉네임으로 `profiles` row를 생성합니다.
클라이언트에서 보내는 upsert는 `ignoreDuplicates: true` 옵션으로 이미 있는 row를 덮어쓰지 않습니다.
따라서 T2의 성공 조건은 닉네임 일치가 아닌 **user_id로 row 존재 여부**로 판단합니다.

---

## 관련 DB 스키마

```sql
-- profiles (기존 테이블 재사용)
-- id: uuid (auth.users 연동)
-- nickname: text

-- ex_photos (신규 생성 + zodiac_id 컬럼 추가)
CREATE TABLE IF NOT EXISTS public.ex_photos (
  id            text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name     text NOT NULL,
  taken_at      bigint,
  lat           double precision,
  lon           double precision,
  city          text,
  country       text,
  continent     text,
  zodiac_id     text,
  thumbnail_url text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ex_photos ADD COLUMN IF NOT EXISTS zodiac_id text;
```
