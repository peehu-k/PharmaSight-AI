import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FlaskConical, Activity, BarChart2, Lightbulb, GraduationCap, Camera } from "lucide-react";
import InspectionPanel from "./components/InspectionPanel";
import QualityGrid from "./components/QualityGrid";
import ExplainabilityPanel from "./components/ExplainabilityPanel";
import RecommendationsPanel from "./components/RecommendationsPanel";
import LearningPanel from "./components/LearningPanel";
import { inspectImage, type InspectResponse, type SimulationResponse } from "./api/pharmasight";

type Tab = "inspect" | "quality" | "explain" | "recommend" | "learning";

export default function App() {
  const [result, setResult]       = useState<InspectResponse | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<Tab>("inspect");
  const [activeCamera, setActiveCamera] = useState(1);

  useEffect(() => {
    if (result) {
      console.log("Result updated — trust:", result.trust?.trust_score,
                  "decision:", result.trust?.decision);
    }
  }, [result]);

  const handleUpload = async (file: File) => {
    try {
      setLoading(true);
      setError(null);
      const data = await inspectImage(file);
      setResult(data);
      setTab("inspect");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("failed")
          ? "Backend offline — run: uvicorn backend.main:app --reload --port 8000"
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setTab("inspect");
  };

  // Fix: use result.image (URL) — InspectResponse has no annotated_image_b64 field
  const handleSimulationComplete = (simResult: SimulationResponse) => {
    if (!result) return;
    setResult({
      ...result,
      // simulation_engine returns base64; wrap as data URL for <img> src
      image: simResult.modified_image_b64
        ? `data:image/jpeg;base64,${simResult.modified_image_b64}`
        : result.image,
      quality:         simResult.quality,
      trust:           simResult.trust,
      recommendations: simResult.recommendations,
      detection: {
        ...result.detection,
        ...simResult.detection,
      },
    });
  };

  const tabs = [
    { id: "inspect"  as Tab, label: "Inspection",    icon: <FlaskConical size={14} /> },
    { id: "quality"  as Tab, label: "Quality",       icon: <Activity size={14} /> },
    { id: "explain"  as Tab, label: "Explainability",icon: <BarChart2 size={14} /> },
    { id: "recommend"as Tab, label: "Recommendations",icon:<Lightbulb size={14} /> },
    { id: "learning" as Tab, label: "System Learning",icon:<GraduationCap size={14} /> },
  ];

  return (
    <div className="min-h-screen relative" style={{ background: "#0a0e1a" }}>

      {/* Header */}
      <header className="border-b relative z-10" style={{
        borderColor:    "rgba(0, 212, 255, 0.2)",
        background:     "rgba(13, 17, 23, 0.8)",
        backdropFilter: "blur(12px)",
      }}>
        <div className="max-w-[1920px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">

            {/* Logo */}
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-3xl font-bold tracking-wider font-mono"
                    style={{ color: "#00d4ff" }}>
                  PHARMASIGHT
                </h1>
                <p className="text-xs metric-label mt-1">TRUST-AWARE AI INSPECTION SYSTEM</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                   style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
                <div className="status-live" />
                <span className="text-xs font-mono text-green-400">SYSTEM ONLINE</span>
              </div>
            </div>

            {/* Camera Selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs metric-label">CAMERA FEED</span>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((cam) => (
                  <button
                    key={cam}
                    onClick={() => setActiveCamera(cam)}
                    className={`relative p-2.5 rounded-lg transition-all ${
                      activeCamera === cam
                        ? "glass-card"
                        : "bg-gray-900/50 border border-gray-800"
                    }`}
                    style={activeCamera === cam ? { borderColor: "#00d4ff" } : {}}
                  >
                    <Camera size={18}
                      className={activeCamera === cam ? "text-cyan-400" : "text-gray-600"} />
                    {activeCamera === cam && (
                      <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full pulse-dot" />
                    )}
                    <div className="text-[10px] font-mono mt-0.5"
                         style={{ color: activeCamera === cam ? "#00d4ff" : "#6b7280" }}>
                      CAM{cam}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* System Info */}
            {result && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 text-xs font-mono text-gray-400"
              >
                <div>MODEL: <span className="text-cyan-400">{result.model_version}</span></div>
                <div>INFERENCE: <span className="text-cyan-400">{result.inference_ms}ms</span></div>
              </motion.div>
            )}
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b relative z-10" style={{
        borderColor: "rgba(0, 212, 255, 0.15)",
        background:  "rgba(10, 14, 26, 0.95)",
      }}>
        <div className="max-w-[1920px] mx-auto px-6 flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative"
              style={{
                background:   tab === t.id ? "rgba(0,212,255,0.1)" : "transparent",
                color:        tab === t.id ? "#00d4ff" : "#64748b",
                borderBottom: tab === t.id ? "2px solid #00d4ff" : "2px solid transparent",
              }}
            >
              {t.icon}
              <span className="metric-label" style={{ fontSize: "0.8rem" }}>
                {t.label.toUpperCase()}
              </span>
              {tab === t.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 rounded-t-lg"
                  style={{ background: "rgba(0,212,255,0.05)", zIndex: -1 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-[1920px] mx-auto px-6 py-6 relative z-10">

        {/* Error banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 rounded-lg border text-sm font-mono glass-card glow-red"
            style={{ background: "rgba(239,68,68,0.1)", borderColor: "#ef4444", color: "#ef4444" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠</span>
              <span>{error}</span>
            </div>
          </motion.div>
        )}

        {/* Safety gate banner — shown on any tab when a gate was triggered */}
        {result?.trust?.gate_reason && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 rounded-lg border text-sm font-mono"
            style={{
              background:   "rgba(239,68,68,0.12)",
              borderColor:  "rgba(239,68,68,0.6)",
              color:        "#fca5a5",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🔒</span>
              <div>
                <span className="font-bold text-red-400">SAFETY GATE TRIGGERED — </span>
                {result.trust.gate_reason}
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {tab === "inspect" && (
            <motion.div key="inspect" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <InspectionPanel
                onUpload={handleUpload}
                result={result}
                loading={loading}
                onReset={handleReset}
              />
            </motion.div>
          )}

          {tab === "quality" && (
            <motion.div key="quality" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <QualityGrid quality={result?.quality} 
              trustScore={result?.trust?.trust_score ?? 0} />
            </motion.div>
          )}

          {tab === "explain" && (
            <motion.div key="explain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ExplainabilityPanel trust={result?.trust} />
            </motion.div>
          )}

          {tab === "recommend" && (
            <motion.div key="recommend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <RecommendationsPanel
                recommendations={result?.recommendations}

              />
            </motion.div>
          )}

          {tab === "learning" && (
            <motion.div key="learning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LearningPanel
                currentImageId={result?.image_id}
                currentDecision={result?.trust?.decision}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}