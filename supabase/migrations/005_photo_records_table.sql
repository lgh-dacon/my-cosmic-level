-- ============================================================
-- photo_records 테이블 생성
-- 실행일: 2026-05-07
-- ============================================================

CREATE TABLE IF NOT EXISTS public.photo_records (
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

ALTER TABLE public.photo_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "photo_records 읽기" ON public.photo_records
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "photo_records 삽입" ON public.photo_records
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "photo_records 수정" ON public.photo_records
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "photo_records 삭제" ON public.photo_records
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS photo_records_user_id_idx
  ON public.photo_records (user_id, created_at DESC);
