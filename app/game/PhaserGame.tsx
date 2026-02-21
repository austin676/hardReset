import { useRef, useEffect, useState, lazy, Suspense } from "react";

const GameHUD = lazy(() => import("./GameHUD"));

// ─── PhaserGame ───
// Client‑only React component that mounts a Phaser canvas and
// overlays the React GameHUD on top.

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<InstanceType<typeof import("phaser").Game> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let destroyed = false;

    async function boot() {
      const PhaserModule = await import("phaser");
      const { gameConfig } = await import("~/game/config/gameConfig");

      if (destroyed || !containerRef.current) return;

      const game = new PhaserModule.Game({
        ...gameConfig,
        parent: containerRef.current,
      });

      gameRef.current = game;
      // Expose for minimap player-position polling
      (window as any).__phaserGame = game;
      setLoading(false);

      requestAnimationFrame(() => {
        const canvas = containerRef.current?.querySelector("canvas");
        if (canvas) {
          canvas.setAttribute("tabindex", "0");
          canvas.focus();
        }
      });
    }

    boot();

    return () => {
      destroyed = true;
      (window as any).__phaserGame = null;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#08080f] flex items-center justify-center overflow-hidden">
      {loading && (
        <p className="absolute text-slate-500 text-sm font-mono tracking-widest animate-pulse z-10">
          INITIALIZING SYSTEM...
        </p>
      )}

      {/* Phaser canvas */}
      <div ref={containerRef} className="game-container" style={{ position: "relative", zIndex: 0 }} />

      {/* React UI overlay — renders at native resolution, no pixelation */}
      {!loading && (
        <Suspense fallback={null}>
          <div className="absolute inset-0 z-10 pointer-events-none">
            <GameHUD />
          </div>
        </Suspense>
      )}
    </div>
  );
}
