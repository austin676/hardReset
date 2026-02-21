"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// GameHUD — React overlay on top of the Phaser canvas.
// Subscribes to gameEventBus so all data comes from the running game.
// Renders at native DOM resolution — no Phaser pixel-art scaling.

interface TaskItem { id: string; label: string; completed: boolean; }

const ROOMS_DATA = [
  { id: "reactor",    name: "Reactor Core",    x: 2,  y: 2,  w: 14, h: 12, color: "#ff4466" },
  { id: "server",     name: "Server Room",     x: 2,  y: 22, w: 14, h: 12, color: "#00ccff" },
  { id: "security",   name: "Security",        x: 2,  y: 41, w: 14, h: 10, color: "#ff8800" },
  { id: "medbay",     name: "Med Bay",         x: 2,  y: 57, w: 14, h: 7,  color: "#00ffaa" },
  { id: "cafeteria",  name: "Cafeteria",       x: 32, y: 2,  w: 16, h: 16, color: "#ffdd00" },
  { id: "storage",    name: "Data Vault",      x: 32, y: 26, w: 16, h: 12, color: "#aa88ff" },
  { id: "admin",      name: "Admin",           x: 32, y: 47, w: 16, h: 16, color: "#4488ff" },
  { id: "weapons",    name: "Weapons Bay",     x: 62, y: 2,  w: 14, h: 12, color: "#ff3333" },
  { id: "shields",    name: "Shield Control",  x: 62, y: 22, w: 14, h: 12, color: "#33ff88" },
  { id: "navigation", name: "Navigation",      x: 62, y: 41, w: 14, h: 10, color: "#88ccff" },
  { id: "comms",      name: "Comms Hub",       x: 62, y: 57, w: 14, h: 7,  color: "#ff88ff" },
];
const MAP_W = 80;
const MAP_H = 65;

export default function GameHUD() {
  const [tasks, setTasks]           = useState<TaskItem[]>([]);
  const [tasksOpen, setTasksOpen]   = useState(false);
  const [room, setRoom]             = useState("—");
  const [nearStation, setNear]      = useState(false);
  const [stationLabel, setStation]  = useState("");
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);

  // ── Load task list from facilityMap (lazy import to avoid SSR) ──────────────
  useEffect(() => {
    import("~/game/config/facilityMap").then(({ TASK_STATIONS }) => {
      setTasks(TASK_STATIONS.map(s => ({ id: s.id, label: s.label, completed: false })));
    });
  }, []);

  // ── Subscribe to gameEventBus ───────────────────────────────────────────────
  useEffect(() => {
    let bus: any;
    import("~/game/GameEventBus").then(({ gameEventBus }) => {
      bus = gameEventBus;

      bus.on("task:complete", (d: { stationId: string }) => {
        setTasks(prev => prev.map(t => t.id === d.stationId ? { ...t, completed: true } : t));
      });

      bus.on("hud:room:change", (d: { room: string }) => {
        setRoom(d.room);
      });

      bus.on("hud:near:station", (d: { near: boolean; label: string }) => {
        setNear(d.near);
        setStation(d.label);
      });
    });
    return () => {
      if (bus) {
        bus.off("task:complete");
        bus.off("hud:room:change");
        bus.off("hud:near:station");
      }
    };
  }, []);

  // ── Draw minimap rooms once, animate player dot every frame ────────────────
  const drawMinimap = useCallback(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const CW = canvas.width, CH = canvas.height;
    const scaleX = CW / MAP_W, scaleY = CH / MAP_H;

    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = "#080c14";
    ctx.fillRect(0, 0, CW, CH);

    // Rooms
    for (const r of ROOMS_DATA) {
      ctx.fillStyle = r.color + "33"; // 20% opacity fill
      ctx.fillRect(r.x * scaleX, r.y * scaleY, r.w * scaleX, r.h * scaleY);
      ctx.strokeStyle = r.color + "bb";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(r.x * scaleX, r.y * scaleY, r.w * scaleX, r.h * scaleY);
    }

    // Player dot
    const main = (window as any).__phaserGame?.scene?.getScene("MainScene") as any;
    if (main?.player) {
      const TILE = 16;
      const px = (main.player.x / TILE) * scaleX;
      const py = (main.player.y / TILE) * scaleY;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#39ff14";
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(drawMinimap);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawMinimap);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawMinimap]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const done  = tasks.filter(t => t.completed).length;
  const total = tasks.length;
  const pct   = total > 0 ? (done / total) * 100 : 0;
  const complete = pct >= 100;

  // ── Phaser keyboard bridge ─────────────────────────────────────────────────
  const emitInteract = () => {
    import("~/game/GameEventBus").then(({ gameEventBus }) => {
      gameEventBus.emit("task:interact", { fromButton: true });
    });
  };
  const emitReport = () => {
    import("~/game/GameEventBus").then(({ gameEventBus }) => {
      gameEventBus.emit("report:body", {});
    });
  };
  const emitMeeting = () => {
    import("~/game/GameEventBus").then(({ gameEventBus }) => {
      gameEventBus.emit("meeting:call", {});
    });
  };

  return (
    <div
      className="w-full h-full flex flex-col select-none font-mono"
    >
      {/* ── TOP BAR ── */}
      <div
        style={{ pointerEvents: "auto", background: "rgba(8,12,20,0.88)", borderBottom: "1px solid #1e3a5f" }}
        className="flex items-center gap-3 px-4 h-12 shrink-0 z-20"
      >
        {/* Room name */}
        <span className="text-xs font-bold tracking-widest uppercase text-slate-400 w-36 truncate">
          {room}
        </span>

        {/* Progress bar */}
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "#111827", border: "1px solid #1e3a5f" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: complete ? "#39ff14" : "linear-gradient(90deg, #00c6ff, #00fff0)",
                boxShadow: complete ? "0 0 8px #39ff14" : "0 0 6px #00fff088",
              }}
            />
          </div>
          <span className="text-xs font-bold whitespace-nowrap" style={{ color: complete ? "#39ff14" : "#00fff0" }}>
            {complete ? "COMPLETE" : `${done} / ${total}`}
          </span>
        </div>

        {/* Task toggle */}
        <button
          style={{ pointerEvents: "auto", border: "1px solid #1e3a5f" }}
          className="text-xs px-3 py-1 rounded font-bold tracking-widest text-cyan-400 hover:bg-cyan-900/40 transition-colors"
          onClick={() => setTasksOpen(o => !o)}
        >
          [T] TASKS
        </button>

        {/* Minimap */}
        <div style={{ border: "1px solid #1e3a5f", borderRadius: 4, overflow: "hidden" }}>
          <canvas ref={minimapRef} width={112} height={91} style={{ display: "block" }} />
        </div>
      </div>

      {/* ── TASK PANEL (slides down from top bar) ── */}
      <div
        style={{
          pointerEvents: tasksOpen ? "auto" : "none",
          transition: "opacity 0.2s, transform 0.2s",
          opacity: tasksOpen ? 1 : 0,
          transform: tasksOpen ? "translateY(0)" : "translateY(-8px)",
          background: "rgba(8,12,20,0.97)",
          border: "1px solid #1e3a5f",
          borderTop: "none",
          width: 260,
          maxHeight: 360,
          overflowY: "auto",
          position: "absolute",
          top: 48,
          right: 16,
          zIndex: 30,
          borderRadius: "0 0 8px 8px",
        }}
      >
        <div className="p-3">
          <p className="text-xs font-bold tracking-widest text-cyan-400 mb-3 border-b border-slate-700 pb-2">
            TASK OBJECTIVES
          </p>
          {tasks.map(t => (
            <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-slate-800 last:border-0">
              <span style={{ color: t.completed ? "#39ff14" : "#334155", fontSize: 10 }}>
                {t.completed ? "◆" : "■"}
              </span>
              <span
                className="text-xs flex-1"
                style={{ color: t.completed ? "#39ff14" : "#94a3b8", textDecoration: t.completed ? "line-through" : "none" }}
              >
                {t.label}
              </span>
              {t.completed && <span className="text-xs" style={{ color: "#39ff14" }}>✓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── SPACER ── */}
      <div className="flex-1" />

      {/* ── STATION PROMPT (above bottom bar) ── */}
      {nearStation && (
        <div className="flex justify-center pb-2" style={{ pointerEvents: "none" }}>
          <div
            style={{
              background: "rgba(0,255,240,0.1)",
              border: "1px solid #00fff0",
              borderRadius: 6,
              padding: "4px 14px",
              backdropFilter: "blur(4px)",
            }}
          >
            <span className="text-xs font-bold tracking-wider" style={{ color: "#00fff0" }}>
              Press <kbd style={{
                background: "#0d1117", border: "1px solid #00fff0", borderRadius: 3,
                padding: "1px 5px", fontSize: 11, color: "#00fff0",
              }}>E</kbd> to interact — {stationLabel}
            </span>
          </div>
        </div>
      )}

      {/* ── BOTTOM BAR ── */}
      <div
        style={{ pointerEvents: "auto", background: "rgba(8,12,20,0.88)", borderTop: "1px solid #1e3a5f" }}
        className="flex items-center justify-between px-6 h-12 shrink-0 z-20"
      >
        {/* USE */}
        <button
          onClick={emitInteract}
          disabled={!nearStation}
          style={{
            border: nearStation ? "1px solid #00fff0" : "1px solid #1e293b",
            color: nearStation ? "#00fff0" : "#334155",
            background: nearStation ? "rgba(0,255,240,0.08)" : "transparent",
            boxShadow: nearStation ? "0 0 8px #00fff044" : "none",
            transition: "all 0.15s",
          }}
          className="text-xs font-bold tracking-widest px-4 py-2 rounded cursor-pointer hover:scale-105 disabled:cursor-default disabled:hover:scale-100"
        >
          [E] USE
        </button>

        {/* EMERGENCY */}
        <button
          onClick={emitMeeting}
          style={{ border: "1px solid #ffbb00", color: "#ffbb00", background: "rgba(255,187,0,0.08)", boxShadow: "0 0 6px #ffbb0033" }}
          className="text-xs font-bold tracking-widest px-4 py-2 rounded hover:scale-105 transition-transform"
        >
          [M] EMERGENCY MEETING
        </button>

        {/* REPORT */}
        <button
          onClick={emitReport}
          style={{ border: "1px solid #ff3355", color: "#ff3355", background: "rgba(255,51,85,0.08)", boxShadow: "0 0 6px #ff335533" }}
          className="text-xs font-bold tracking-widest px-4 py-2 rounded hover:scale-105 transition-transform"
        >
          [R] REPORT
        </button>
      </div>
    </div>
  );
}
