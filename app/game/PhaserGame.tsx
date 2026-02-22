import { useRef, useEffect, useState, lazy, Suspense } from "react";
import { useGameStore } from "~/store/gameStore";
import { useSocket } from "~/hooks/useSocket";

const GameHUD = lazy(() => import("./GameHUD"));

// ─── PhaserGame ───
// Client‑only React component that mounts a Phaser canvas and
// overlays the React GameHUD on top.

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<InstanceType<typeof import("phaser").Game> | null>(null);
  const [loading, setLoading] = useState(true);
  const sceneReadyRef = useRef(false);   // tracks whether scene:ready already fired

  // Keep socket listeners alive on the game route (Lobby unmounts when we navigate here)
  useSocket();

  // ── Spawn helper — always reads fresh from store ───────────────────────
  const spawnRemotePlayers = () => {
    import("~/game/GameEventBus").then(({ gameEventBus }) => {
      const { players, myPlayerId: selfId } = useGameStore.getState();
      const SPAWN_X = (28 + 8) * 16;
      const SPAWN_Y = (4  + 8) * 16;
      players.forEach((p) => {
        if (p.id === selfId) return;
        const colorNum = typeof p.color === "string"
          ? parseInt((p.color as string).replace("#", ""), 16)
          : (p.color as unknown as number ?? 0xef4444);
        gameEventBus.emit("remote:player:move", {
          id:        p.id,
          x:         SPAWN_X,
          y:         SPAWN_Y,
          direction: "down",
          isMoving:  false,
          role:      "agent",
          name:      p.name ?? "Player",
          color:     colorNum,
          alive:     p.isAlive ?? true,
        });
      });
    });
  };

  // ── Bridge PLAYER_MOVE bus → socket.emit('playerMove') ───────────────────
  useEffect(() => {
    let bus: any;
    import("~/game/GameEventBus").then(({ gameEventBus }) => {
      bus = gameEventBus;

      bus.on("player:move", ({ x, y, direction }: { x: number; y: number; direction: string }) => {
        const rc = useGameStore.getState().roomCode;
        if (!rc) return;
        // Include the current map so other clients know which room we're in
        const mainScene = (window as any).__phaserGame?.scene?.getScene("MainScene") as any;
        const mapId = mainScene?.currentMapId ?? "cafeteria";
        import("~/hooks/useSocket").then(({ getSocket }) => {
          const sock = getSocket();
          if (sock?.connected) sock.emit("playerMove", { roomId: rc, x, y, direction, mapId });
        });
      });

      // Spawn remote players when Phaser scene becomes ready
      bus.on("scene:ready", () => {
        sceneReadyRef.current = true;
        spawnRemotePlayers();
      });

      // If scene:ready already fired before this effect ran, spawn immediately
      if (sceneReadyRef.current) spawnRemotePlayers();
    });
    return () => {
      if (bus) {
        bus.off("player:move");
        bus.off("scene:ready");
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
