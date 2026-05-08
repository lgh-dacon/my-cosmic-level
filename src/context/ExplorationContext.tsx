import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { computeStats, extractPhotoMeta, type PhotoRecord } from "@/lib/exploration";
import { ExplorationCtx } from "./exploration-context";
import { supabase } from "@/lib/supabase";
import { initSession } from "@/lib/auth";

export const ExplorationProvider = ({ children }: { children: ReactNode }) => {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [pending, setPending] = useState<PhotoRecord[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // ── 앱 초기화: 세션 확보 → profiles upsert → ex_photos 로드 ──
  useEffect(() => {
    async function init() {
      try {
        const session = await initSession();
        const uid = session.user.id;
        setUserId(uid);

        const now = new Date().toISOString();
        await supabase.from("profiles").upsert(
          { id: uid, nickname: `탐사대원_${uid.slice(0, 6).toUpperCase()}`, created_at: now, updated_at: now },
          { onConflict: "id", ignoreDuplicates: true },
        );

        const { data, error } = await supabase
          .from("photo_records")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
          const loaded: PhotoRecord[] = data.map((row) => ({
            id:           row.id,
            url:          row.thumbnail_url ?? "",
            thumbnailUrl: row.thumbnail_url ?? undefined,
            fileName:     row.file_name,
            takenAt:      row.taken_at ?? undefined,
            lat:          row.lat ?? undefined,
            lon:          row.lon ?? undefined,
            city:         row.city ?? undefined,
            country:      row.country ?? undefined,
            continent:    row.continent ?? undefined,
            zodiacId:     row.zodiac_id ?? undefined,
          }));
          setPhotos(loaded);
        }
      } catch (err) {
        console.error("[ExplorationContext] 초기화 실패:", err);
      } finally {
        setIsReady(true);
      }
    }
    init();
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const recs = await Promise.all(arr.map(extractPhotoMeta));
    setPhotos((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...recs.filter((r) => !seen.has(r.id))];
    });
    return recs;
  }, []);

  const stageFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const recs = await Promise.all(arr.map(extractPhotoMeta));
    let added: PhotoRecord[] = [];
    setPending((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      added = recs.filter((r) => !seen.has(r.id));
      return [...prev, ...added];
    });
    return added;
  }, []);

  // ── commitPending: 로컬 반영 + DB INSERT ──
  const commitPending = useCallback(async (): Promise<PhotoRecord[]> => {
    let committed: PhotoRecord[] = [];
    setPhotos((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      committed = pending.filter((r) => !seen.has(r.id));
      return [...prev, ...committed];
    });
    setPending([]);

    if (userId && committed.length > 0) {
      const { error } = await supabase.from("photo_records").upsert(
        committed.map((r) => ({
          id:            r.id,
          user_id:       userId,
          file_name:     r.fileName,
          taken_at:      r.takenAt ?? null,
          lat:           r.lat ?? null,
          lon:           r.lon ?? null,
          city:          r.city ?? null,
          country:       r.country ?? null,
          continent:     r.continent ?? null,
          zodiac_id:     null,
          thumbnail_url: r.thumbnailUrl ?? null,
        })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) console.error("[commitPending] DB 저장 실패:", error.message);
    }

    return committed;
  }, [pending, userId]);

  const removePending = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearPending = useCallback(() => setPending([]), []);

  // ── removePhoto: 로컬 + DB DELETE ──
  const removePhoto = useCallback(
    (id: string) => {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      if (userId) {
        supabase.from("photo_records").delete().eq("id", id).eq("user_id", userId)
          .then(({ error }) => { if (error) console.error("[removePhoto] 삭제 실패:", error.message); });
      }
    },
    [userId],
  );

  // ── updatePhoto: 로컬 + DB UPDATE (zodiacId 등 patch 반영) ──
  const updatePhoto = useCallback(
    (id: string, patch: Partial<PhotoRecord>) => {
      setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      if (userId && patch.zodiacId !== undefined) {
        supabase.from("photo_records").update({ zodiac_id: patch.zodiacId }).eq("id", id).eq("user_id", userId)
          .then(({ error }) => { if (error) console.error("[updatePhoto] 업데이트 실패:", error.message); });
      }
    },
    [userId],
  );

  const clear = useCallback(() => {
    setPhotos([]);
    setPending([]);
    if (userId) {
      supabase.from("photo_records").delete().eq("user_id", userId)
        .then(({ error }) => { if (error) console.error("[clear] 전체 삭제 실패:", error.message); });
    }
  }, [userId]);

  const stats = useMemo(() => computeStats(photos), [photos]);

  const value = useMemo(
    () => ({
      photos, pending, stats, isReady,
      addFiles, stageFiles, commitPending,
      removePending, clearPending, removePhoto, updatePhoto, clear,
    }),
    [photos, pending, stats, isReady, addFiles, stageFiles, commitPending, removePending, clearPending, removePhoto, updatePhoto, clear],
  );

  return <ExplorationCtx.Provider value={value}>{children}</ExplorationCtx.Provider>;
};

export function useExploration() {
  const ctx = useContext(ExplorationCtx);
  if (!ctx) throw new Error("useExploration must be used inside ExplorationProvider");
  return ctx;
}
