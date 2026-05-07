import { useRef, useState } from "react";
import { FilePlus2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { useExploration } from "@/context/ExplorationContext";
import { computeZodiac, type ZodiacInfo } from "@/lib/zodiac";
import ZodiacResultCard from "@/components/ZodiacResultCard";

const MAX_PENDING = 30;

/* ── 4-pointed sparkle star icon ── */
function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2 L13.2 10.8 L22 12 L13.2 13.2 L12 22 L10.8 13.2 L2 12 L10.8 10.8 Z" />
    </svg>
  );
}

interface Props {
  onOpenWisdom?: () => void;
  onOpenCollection?: () => void; // 별 도감(그리드뷰)로 이동
}

const CheckinScreen = ({ onOpenWisdom, onOpenCollection }: Props) => {
  const { photos, pending, stageFiles, removePending, commitPending, updatePhoto } = useExploration();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [resultZodiac, setResultZodiac] = useState<ZodiacInfo | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_PENDING - pending.length;
    if (remaining <= 0) {
      toast(`최대 ${MAX_PENDING}장까지 등록할 수 있어요`);
      return;
    }
    const arr = Array.from(files).slice(0, remaining);
    setBusy(true);
    try {
      const added = await stageFiles(arr);
      if (added.length > 0) {
        toast.success(`별 조각 ${added.length}개 획득`);
      }
      if (files.length > arr.length) {
        toast(`${files.length - arr.length}장은 한도 초과로 제외되었습니다 (최대 ${MAX_PENDING}장)`);
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleLaunch = async () => {
    if (pending.length === 0) {
      toast("별자리를 만들 사진을 등록해주세요");
      return;
    }

    const collectedIds = photos.map((p) => p.zodiacId ?? "").filter(Boolean);
    const committed = await commitPending();

    const rep = committed[0];
    const zodiac = computeZodiac(rep?.takenAt, rep?.lat, rep?.lon, rep?.city, collectedIds);
    setResultZodiac(zodiac);

    // 커밋된 모든 사진에 zodiacId 저장 (로컬 + DB)
    committed.forEach((p) => updatePhoto(p.id, { zodiacId: zodiac.id }));

    toast.success(`별 조각 ${committed.length}개 획득`, {
      description: `${committed.length}장의 사진이 별자리에 추가되었어요`,
    });
  };

  const completionPct = Math.round((pending.length / MAX_PENDING) * 100);
  const recent = [...pending].slice(-MAX_PENDING).reverse();

  return (
    <>
      <div className="animate-fade-up flex min-h-[calc(100dvh-3.5rem)] flex-col px-5 pb-32 pt-2">
        {/* Header */}
        <div className="mb-3 text-center">
          <p className="text-[11px] font-semibold tracking-widest text-muted-foreground">
            사진을 업로드하면 나만의 별자리가 만들어집니다.
          </p>
          <h2 className="mt-1 text-[26px] font-bold leading-tight text-foreground">사진으로 별자리 만들기</h2>
        </div>

        {/* Center orb button */}
        <div className="my-4 flex flex-col items-center">
          <div className="relative flex h-56 w-56 items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-border" />
            <div className="absolute inset-3 rounded-full border border-dashed border-border animate-spin-slow" />
            <button
              onClick={handleLaunch}
              disabled={busy}
              className="relative z-10 flex h-36 w-36 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-button transition-transform active:scale-[0.96] disabled:opacity-70"
            >
              {busy ? (
                <span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
              ) : (
                <StarIcon className="h-10 w-10" />
              )}
            </button>
          </div>
          <p className="mt-2 text-[11px] font-semibold tracking-widest text-muted-foreground">
            {busy ? "사진에서 별빛을 추출하는 중..." : `별자리 완성도: ${completionPct}%`}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {/* Photo grid */}
        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[14px] font-bold text-foreground">오늘 만든 별자리</p>
            <span className="text-[11px] font-medium text-muted-foreground">
              {pending.length}/{MAX_PENDING}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {recent.map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-secondary">
                <img src={p.url} alt={p.fileName} className="h-full w-full object-cover" />
                <button
                  onClick={() => removePending(p.id)}
                  className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                  aria-label="삭제"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute inset-x-0 top-0 z-[5] bg-gradient-to-b from-black/70 to-transparent px-1.5 py-1 text-white">
                  <div className="flex items-center gap-0.5 truncate text-[10px] font-bold leading-tight">
                    <MapPin className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{p.city ?? "위치"}</span>
                  </div>
                  {p.lat != null && p.lon != null && (
                    <p className="mt-0.5 text-[8px] font-medium leading-tight opacity-90">
                      {p.lat.toFixed(3)}°, {p.lon.toFixed(3)}°
                    </p>
                  )}
                </div>
              </div>
            ))}
            {pending.length < MAX_PENDING && (
              <button
                onClick={() => inputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-muted-foreground"
              >
                <FilePlus2 className="h-4 w-4" />
                <span className="text-[10px] font-bold">BROWSE</span>
              </button>
            )}
          </div>
        </section>

        {/* 행운의 별조각 받기 */}
        {onOpenWisdom && (
          <button
            onClick={onOpenWisdom}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-secondary py-3.5 text-[14px] font-bold text-foreground transition-colors hover:bg-accent"
          >
            <StarIcon className="h-4 w-4" />
            행운의 별조각 받기
          </button>
        )}
      </div>

      {/* 별자리 결과 카드 */}
      {resultZodiac && (
        <ZodiacResultCard
          zodiac={resultZodiac}
          onClose={() => setResultZodiac(null)}
          onViewCollection={() => {
            setResultZodiac(null);
            onOpenCollection?.();
          }}
        />
      )}
    </>
  );
};

export default CheckinScreen;
