import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import BottomNav, { type TabKey } from "@/components/BottomNav";
import IntroScreen from "@/components/screens/IntroScreen";
import DashboardScreen from "@/components/screens/DashboardScreen";
import RecordsScreen, { type RecordsView } from "@/components/screens/RecordsScreen";
import CheckinScreen from "@/components/screens/CheckinScreen";
import WisdomModal from "@/components/WisdomModal";
import { useExploration } from "@/context/ExplorationContext";

interface RecordsInit {
  view?: RecordsView;
  city?: string;
}

const Index = () => {
  const [hasStarted, setHasStarted] = useState(
    () => localStorage.getItem("cosmic_started") === "true"
  );
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [recordsInit, setRecordsInit] = useState<RecordsInit | undefined>();
  const [wisdomOpen, setWisdomOpen] = useState(false);
  const { photos, isReady } = useExploration();

  // 기존 사진 데이터가 있는 재방문 유저는 인트로 스킵
  useEffect(() => {
    if (isReady && photos.length > 0) {
      setHasStarted(true);
    }
  }, [isReady, photos.length]);

  const openRecords = (opts?: RecordsInit) => {
    setRecordsInit(opts);
    setTab("records");
  };

  const handleStart = () => {
    localStorage.setItem("cosmic_started", "true");
    setHasStarted(true);
    setTab("checkin");
  };

  if (!hasStarted) {
    return (
      <main className="min-h-dvh bg-surface-2">
        <div className="toss-frame shadow-card">
          <IntroScreen onStart={handleStart} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-surface-2">
      <div className="toss-frame shadow-card">
        <AppHeader subtitle="Planet Exploration" onStarClick={() => setWisdomOpen(true)} />
        {tab === "dashboard" && (
          <DashboardScreen onStart={() => setTab("checkin")} onOpenRecords={openRecords} />
        )}
        {tab === "records" && <RecordsScreen initialView={recordsInit?.view} initialCity={recordsInit?.city} onAddRecord={() => setTab("checkin")} />}
        {tab === "checkin" && (
          <CheckinScreen
            onOpenWisdom={() => setWisdomOpen(true)}
            onOpenCollection={() => openRecords({ view: "grid" })}
          />
        )}
<BottomNav active={tab} onChange={setTab} />
        <WisdomModal open={wisdomOpen} onClose={() => setWisdomOpen(false)} />
      </div>
    </main>
  );
};

export default Index;
