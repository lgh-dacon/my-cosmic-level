-- ============================================================
-- RLS 멤버 가시성 버그 수정 마이그레이션
-- 생성일: 2026-04-30
--
-- 문제 (003 마이그레이션의 부작용):
--   003에서 무한 재귀를 제거하기 위해 ex_planet_members 읽기 정책을
--   "본인 멤버십 OR 소유자 행성"으로 단순화했음.
--   결과적으로 멤버(explorer 역할)가 같은 행성의 다른 멤버를 볼 수 없게 됨.
--   → CrewScreen 동반탐사 우주인 목록에 자기 자신만 표시되거나 아예 비어 있음.
--
-- 해결 방법:
--   SECURITY DEFINER 함수 is_planet_member() 를 통해
--   RLS 우회 없이 안전하게 멤버십 확인
--   → 재귀 없이 "같은 행성 멤버끼리 서로 조회" 복원
--
-- 핵심 원리:
--   SECURITY DEFINER 함수는 함수 소유자 권한으로 실행되므로
--   함수 내부 쿼리에 RLS 가 적용되지 않음.
--   즉, ex_planet_members 정책 안에서 is_planet_member() 를 호출해도
--   그 내부의 ex_planet_members 조회에 다시 정책이 걸리지 않아 재귀가 발생하지 않음.
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 붙여넣기 후 Run
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. 멤버십 확인 헬퍼 함수 생성
--    RLS 정책 내부에서 호출되므로 SECURITY DEFINER 필수
--    stable: 동일 트랜잭션 내 결과 캐시 허용 (행당 1회 실행, 성능 최적화)
-- ──────────────────────────────────────────────────────────
create or replace function public.is_planet_member(p_planet_id uuid)
returns boolean
language sql
security definer  -- 함수 소유자 권한 실행 → RLS 우회 → 재귀 방지
stable
set search_path = public
as $$
  -- 현재 로그인 유저가 해당 행성의 멤버인지 확인
  -- auth.uid() 는 Supabase가 현재 요청의 JWT에서 추출한 유저 ID
  select exists (
    select 1 from public.ex_planet_members
    where planet_id = p_planet_id
      and user_id = auth.uid()
  );
$$;

-- ──────────────────────────────────────────────────────────
-- 2. ex_planets 행성 읽기 정책 수정
--
--    003 정책: owner_id = auth.uid() 만 허용
--              → 멤버(explorer)가 합류한 행성을 조회할 수 없는 문제
--    수정 후:  소유자 OR 멤버 모두 허용
--              is_planet_member() 가 SECURITY DEFINER 이므로 재귀 없음
-- ──────────────────────────────────────────────────────────
drop policy if exists "행성 읽기" on public.ex_planets;

create policy "행성 읽기" on public.ex_planets
  for select using (
    owner_id = auth.uid()     -- 행성 소유자
    or is_planet_member(id)   -- 해당 행성에 합류한 멤버
  );

-- ──────────────────────────────────────────────────────────
-- 3. ex_planet_members 멤버 조회 정책 수정
--
--    003 정책: user_id = auth.uid() OR 소유자 행성의 멤버
--              → explorer 간 서로 보이지 않는 문제
--    수정 후:  is_planet_member() 로 "같은 행성 소속이면 서로 조회 가능" 복원
--              소유자도 자기 행성 멤버 목록 조회 가능 (in 절)
-- ──────────────────────────────────────────────────────────
drop policy if exists "멤버 조회" on public.ex_planet_members;

create policy "멤버 조회" on public.ex_planet_members
  for select using (
    is_planet_member(planet_id)   -- 같은 행성 소속이면 서로 조회 가능 (재귀 없음)
    or planet_id in (             -- 행성 소유자도 자기 행성 멤버 조회 가능
      select id from public.ex_planets where owner_id = auth.uid()
    )
  );
