import { supabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

export async function initSession(): Promise<Session> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`익명 로그인 실패: ${error.message}`);
  if (!data.session) throw new Error("세션 생성 실패");
  return data.session;
}
