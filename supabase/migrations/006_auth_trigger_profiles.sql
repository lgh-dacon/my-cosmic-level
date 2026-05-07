-- ============================================================
-- auth 트리거 — 신규 유저 가입 시 profiles 자동 생성
-- 실행일: 2026-05-07
--
-- 문제: Authentication에는 유저가 쌓이지만 profiles 테이블에 미반영
-- 원인: 트리거가 존재했으나 트리거 생성 이전 유저는 백필 필요
-- 해결:
--   1. handle_new_user() 트리거 함수 생성
--   2. auth.users INSERT 시 자동 실행
--   3. 기존 유저 백필 (ON CONFLICT DO NOTHING)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname)
  VALUES (
    NEW.id,
    '탐사대원_' || UPPER(SUBSTRING(NEW.id::text, 1, 6))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 기존 유저 백필
INSERT INTO public.profiles (id, nickname)
SELECT
  id,
  '탐사대원_' || UPPER(SUBSTRING(id::text, 1, 6))
FROM auth.users
ON CONFLICT (id) DO NOTHING;
