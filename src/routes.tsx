import { lazy } from "react";
import { Route, Routes } from "react-router-dom";

const Home = lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));
const Crops = lazy(() => import("./pages/Crops").then((m) => ({ default: m.Crops })));
const Diagnosis = lazy(() => import("./pages/Diagnosis").then((m) => ({ default: m.Diagnosis })));
const KnowledgeList = lazy(() => import("./pages/PestDetail").then((m) => ({ default: m.KnowledgeList })));
const Experts = lazy(() => import("./pages/Experts").then((m) => ({ default: m.Experts })));
const Cases = lazy(() => import("./pages/Cases").then((m) => ({ default: m.Cases })));
const Offline = lazy(() => import("./pages/Offline").then((m) => ({ default: m.Offline })));
const PestDetail = lazy(() => import("./pages/PestDetail").then((m) => ({ default: m.PestDetail })));

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/crops" element={<Crops />} />
      <Route path="/diagnosis" element={<Diagnosis />} />
      <Route path="/knowledge" element={<KnowledgeList />} />
      <Route path="/knowledge/:slug" element={<PestDetail />} />
      <Route path="/experts" element={<Experts />} />
      <Route path="/cases" element={<Cases />} />
      <Route path="/offline" element={<Offline />} />
    </Routes>
  );
}
