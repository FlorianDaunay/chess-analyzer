import { lazy, Suspense } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "@/ui/layout/Layout";
import { HomePage } from "@/features/home/HomePage";

const AnalyzePage = lazy(() => import("@/features/analyze/AnalyzePage"));
const ReviewPage = lazy(() => import("@/features/review/ReviewPage"));
const PlayPage = lazy(() => import("@/features/play/PlayPage"));
const OnlinePage = lazy(() => import("@/features/online/OnlinePage"));
const TournamentPage = lazy(() => import("@/features/tournament/TournamentPage"));
const TrainPage = lazy(() => import("@/features/train/TrainPage"));
const EditorPage = lazy(() => import("@/features/editor/EditorPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));

function Loading() {
  return <div className="p-8 text-center muted">Loading…</div>;
}

export function App() {
  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/analyze" element={<AnalyzePage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="/online" element={<OnlinePage />} />
            <Route path="/tournament" element={<TournamentPage />} />
            <Route path="/train" element={<TrainPage />} />
            <Route path="/board" element={<EditorPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}
