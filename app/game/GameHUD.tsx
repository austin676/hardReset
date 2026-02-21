"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Task, SubmitResult } from "~/lib/puzzleService";
import { useGameStore } from "~/store/gameStore";

// GameHUD — React overlay on top of the Phaser canvas.
// Subscribes to gameEventBus so all data comes from the running game.
// Renders at native DOM resolution — no Phaser pixel-art scaling.

interface TaskItem { id: string; label: string; completed: boolean; }

const ROOMS_DATA = [
  { id: "codelab", name: "Code Lab", x: 2, y: 4, w: 16, h: 16, color: "#00aaff" },
  { id: "cafeteria", name: "Cafeteria", x: 28, y: 4, w: 16, h: 16, color: "#ffcc33" },
  { id: "debugroom", name: "Debug Room", x: 54, y: 4, w: 16, h: 16, color: "#cc66ff" },
];
const BRIDGES_DATA = [
  { x: 18, y: 10, w: 10, h: 4 },
  { x: 44, y: 10, w: 10, h: 4 },
];
const MAP_W = 72;
const MAP_H = 24;
const MINIMAP_SIZE = 200;

export default function GameHUD() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [room, setRoom] = useState("—");
  const [nearStation, setNear] = useState(false);
  const [stationLabel, setStation] = useState("");
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // ── Role & ability state ─────────────────────────────────────────────────────
  const myRole = useGameStore(s => s.myRole);
  const players = useGameStore(s => s.players);
  const roomCode = useGameStore(s => s.roomCode);
  const myPlayerId = useGameStore(s => s.myPlayerId);
  const scores = useGameStore(s => s.scores);
  const roundNumber = useGameStore(s => s.roundNumber);
  const timeLeft = useGameStore(s => s.timeLeft);

  // Role reveal banner
  const [roleBanner, setRoleBanner] = useState(false);

  // Round leaderboard overlay
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<{ socketId: string; name: string; role: string; score: number }[]>([]);
  const [leaderboardRound, setLeaderboardRound] = useState(0);
  const leaderboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-ability cooldown remaining (seconds)
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({
    time_bomb: 0, code_delay: 0, syntax_scramble: 0,
  });
  // Notification when own ability fires
  const [abilityNotif, setAbilityNotif] = useState<string | null>(null);

  // ── ABILITY EFFECTS (applied when we receive one) ────────────────────────
  // Time bomb
  const [bombActive, setBombActive] = useState(false);
  const [bombLeft, setBombLeft] = useState(0);
  const bombRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Code delay
  const [inputFrozen, setInputFrozen] = useState(false);
  const [frozenLeft, setFrozenLeft] = useState(0);
  const frozenRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Puzzle popup state ─────────────────────────────────────────────────────
  const [puzzleOpen, setPuzzleOpen] = useState(false);
  const [puzzle, setPuzzle] = useState<Task | null>(null);
  const [puzzleCode, setPuzzleCode] = useState("");
  const [puzzleResult, setPuzzleResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [puzzleStationId, setPuzzleStationId] = useState("");
  const [loadingPuzzle, setLoadingPuzzle] = useState(false);

  // ── Role reveal banner ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!myRole) return;
    setRoleBanner(true);
    const t = setTimeout(() => setRoleBanner(false), 4000);
    return () => clearTimeout(t);
  }, [myRole]);

  // ── Ability cooldown tickers ───────────────────────────────────────────────
  const startCooldown = useCallback((abilityType: string, seconds: number) => {
    setCooldowns(prev => ({ ...prev, [abilityType]: seconds }));
    const tick = setInterval(() => {
      setCooldowns(prev => {
        const next = (prev[abilityType] ?? 0) - 1;
        if (next <= 0) { clearInterval(tick); return { ...prev, [abilityType]: 0 }; }
        return { ...prev, [abilityType]: next };
      });
    }, 1000);
  }, []);

  // ── Receive ability effects ─────────────────────────────────────────────────
  useEffect(() => {
    let bus: any;
    const onAbility = ({ fromName, abilityType }: any) => {
      if (abilityType === "time_bomb") {
        setBombActive(true); setBombLeft(20);
        if (bombRef.current) clearInterval(bombRef.current);
        bombRef.current = setInterval(() => {
          setBombLeft(prev => {
            if (prev <= 1) {
              clearInterval(bombRef.current!);
              setBombActive(false);
              // Auto-close puzzle with failure
              setPuzzleOpen(open => {
                if (open) {
                  import("~/game/GameEventBus").then(({ gameEventBus }) =>
                    gameEventBus.emit("task:modal:close", {})
                  );
                }
                return false;
              });
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (abilityType === "code_delay") {
        setInputFrozen(true); setFrozenLeft(8);
        if (frozenRef.current) clearInterval(frozenRef.current);
        frozenRef.current = setInterval(() => {
          setFrozenLeft(prev => {
            if (prev <= 1) { clearInterval(frozenRef.current!); setInputFrozen(false); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else if (abilityType === "syntax_scramble") {
        // Reload a random task (scrambles the problem)
        import("~/lib/puzzleService").then(({ fetchTasks }) => fetchTasks()).then(all => {
          const pick = all[Math.floor(Math.random() * all.length)];
          setPuzzle(pick);
          setPuzzleCode(pick.starterCode);
          setPuzzleResult(null);
        });
      }
    };
    const onAbilityUsed = ({ abilityType, targetCount, targetNames }: any) => {
      const names: Record<string, string> = {
        time_bomb: "💣 Time Bomb", code_delay: "⏸ Code Delay", syntax_scramble: "🔀 Syntax Scramble"
      };
      const details = targetCount > 0 ? `→ ${targetCount} player${targetCount !== 1 ? 's' : ''}` : '(no targets)';
      setAbilityNotif(`${names[abilityType] ?? abilityType} ${details}`);
      setTimeout(() => setAbilityNotif(null), 3000);
    };
    import("~/game/GameEventBus").then(({ gameEventBus }) => {
      bus = gameEventBus;
      bus.on("ability:received", onAbility);
      bus.on("ability:used", onAbilityUsed);
    });
    return () => {
      if (bus) { bus.off("ability:received", onAbility); bus.off("ability:used", onAbilityUsed); }
      if (bombRef.current) clearInterval(bombRef.current);
      if (frozenRef.current) clearInterval(frozenRef.current);
    };
  }, []);

  // ── Round leaderboard listener ──────────────────────────────────────────────
  useEffect(() => {
    let bus: any;
    const onRoundEnd = ({ round, leaderboard }: any) => {
      setLeaderboardData(leaderboard ?? []);
      setLeaderboardRound(round);
      setLeaderboardOpen(true);
      // Auto-close after 10 seconds
      if (leaderboardTimerRef.current) clearTimeout(leaderboardTimerRef.current);
      leaderboardTimerRef.current = setTimeout(() => setLeaderboardOpen(false), 10000);
    };
    import("~/game/GameEventBus").then(({ gameEventBus }) => {
      bus = gameEventBus;
      bus.on("round:end", onRoundEnd);
    });
    return () => {
      if (bus) bus.off("round:end", onRoundEnd);
      if (leaderboardTimerRef.current) clearTimeout(leaderboardTimerRef.current);
    };
  }, []);

  // ── Imposter: fire ability immediately (no target picker) ───────────────────
  const COOLDOWN_DURATIONS: Record<string, number> = {
    time_bomb: 40, code_delay: 30, syntax_scramble: 50,
  };
  const fireAbility = useCallback((abilityType: string) => {
    if (!roomCode) return;
    import("~/hooks/useSocket").then(({ getSocket }) => {
      getSocket().emit("useAbility", { roomId: roomCode, abilityType });
    });
    startCooldown(abilityType, COOLDOWN_DURATIONS[abilityType] ?? 30);
  }, [roomCode, startCooldown]);
  useEffect(() => {
    import("~/game/config/facilityMap").then(({ TASK_STATIONS }) => {
      setTasks(TASK_STATIONS.map(s => ({ id: s.id, label: s.label, completed: false })));
    });
  }, []);

  // ── Open puzzle popup when event fires ────────────────────────────────────
  useEffect(() => {
    let bus: any;
    const onOpenPuzzle = async (d: { stationId: string; label: string }) => {
      setPuzzleStationId(d.stationId);
      setPuzzleResult(null);
      setSubmitting(false);
      setLoadingPuzzle(true);
      setPuzzleOpen(true);

      try {
        const { fetchTasks } = await import("~/lib/puzzleService");
        const all = await fetchTasks();
        // Pick randomly, or use a task that matches the station label domain if possible
        const pick = all[Math.floor(Math.random() * all.length)];
        setPuzzle(pick);
        setPuzzleCode(pick.starterCode);
      } catch {
        setPuzzle(null);
      } finally {
        setLoadingPuzzle(false);
      }
    };
    import("~/game/GameEventBus").then(({ gameEventBus }) => {
      bus = gameEventBus;
      bus.on("puzzle:open", onOpenPuzzle);
    });
    return () => { if (bus) bus.off("puzzle:open", onOpenPuzzle); };
  }, []);

  // ── Submit code to puzzle engine ───────────────────────────────────────────
  const submitPuzzle = useCallback(async () => {
    if (!puzzle || submitting) return;
    setSubmitting(true);
    setPuzzleResult(null);
    try {
      const { submitCode } = await import("~/lib/puzzleService");
      const result = await submitCode(puzzle.id, puzzle.language, puzzleCode);
      // Record attempt on backend for AI report
      const { getSocket } = await import("~/hooks/useSocket");
      getSocket().emit("recordAttempt", { roomId: roomCode, taskId: puzzle.id, passed: result.passed, userCode: puzzleCode });
      setPuzzleResult(result);
      if (result.passed) {
        // Award points via backend
        getSocket().emit("taskComplete", { roomId: roomCode, taskId: puzzle.id });
        // Mark station complete in Phaser
        const { gameEventBus } = await import("~/game/GameEventBus");
        gameEventBus.emit("task:complete", { stationId: puzzleStationId });
        setTasks(prev => prev.map(t => t.id === puzzleStationId ? { ...t, completed: true } : t));
      }
    } catch (err: any) {
      setPuzzleResult({ passed: false, stdout: null, stderr: err.message, time: null, memory: null });
    } finally {
      setSubmitting(false);
    }
  }, [puzzle, puzzleCode, puzzleStationId, submitting]);

  // ── Close puzzle popup ─────────────────────────────────────────────────────
  const closePuzzle = useCallback(async () => {
    setPuzzleOpen(false);
    const { gameEventBus } = await import("~/game/GameEventBus");
    // Resume movement; if puzzle was already passed, TASK_COMPLETE already resumed
    if (!puzzleResult?.passed) gameEventBus.emit("task:modal:close", {});
  }, [puzzleResult]);  

  // ── Subscribe to gameEventBus ───────────────────────────────────────────────
  useEffect(() => {
    let bus: any;
    const onComplete = (d: { stationId: string }) =>
      setTasks(prev => prev.map(t => t.id === d.stationId ? { ...t, completed: true } : t));
    const onRoom = (d: { room: string }) => setRoom(d.room);
    const onNear = (d: { near: boolean; label: string }) => {
      setNear(d.near);
      setStation(d.label);
    };
    import("~/game/GameEventBus").then(({ gameEventBus }) => {
      bus = gameEventBus;
      bus.on("task:complete", onComplete);
      bus.on("hud:room:change", onRoom);
      bus.on("hud:near:station", onNear);
    });
    return () => {
      if (bus) {
        bus.off("task:complete", onComplete);
        bus.off("hud:room:change", onRoom);
        bus.off("hud:near:station", onNear);
      }
    };
  }, []);

  // ── Close puzzle on Escape ────────────────────────────────────────────────
  useEffect(() => {
    if (!puzzleOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePuzzle(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [puzzleOpen, closePuzzle]);

  // ── Draw circular minimap ──────────────────────────────────────────────────
  const drawMinimap = useCallback(() => {
    if (rafRef.current === -1) return;
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const S = MINIMAP_SIZE;
    const R = S / 2;
    const scaleX = S / MAP_W, scaleY = S / MAP_H;

    ctx.clearRect(0, 0, S, S);

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();

    // Background
    ctx.fillStyle = "rgba(8, 12, 20, 0.6)";
    ctx.fillRect(0, 0, S, S);

    // Rooms
    for (const r of ROOMS_DATA) {
      ctx.fillStyle = r.color + "33";
      ctx.fillRect(r.x * scaleX, r.y * scaleY, r.w * scaleX, r.h * scaleY);
      ctx.strokeStyle = r.color + "88";
      ctx.lineWidth = 0.6;
      ctx.strokeRect(r.x * scaleX, r.y * scaleY, r.w * scaleX, r.h * scaleY);
    }

    // Bridge corridors
    for (const b of BRIDGES_DATA) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      ctx.fillRect(b.x * scaleX, b.y * scaleY, b.w * scaleX, b.h * scaleY);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 0.4;
      ctx.strokeRect(b.x * scaleX, b.y * scaleY, b.w * scaleX, b.h * scaleY);
    }

    // Player dot with glow
    const main = (window as any).__phaserGame?.scene?.getScene("MainScene") as any;
    if (main?.player) {
      const TILE = 16;
      const px = (main.player.x / TILE) * scaleX;
      const py = (main.player.y / TILE) * scaleY;

      // Glow ring
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(57, 255, 20, 0.15)";
      ctx.fill();

      // Solid dot
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#39ff14";
      ctx.fill();

      // Center bright
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }

    ctx.restore();

    // Circular border ring
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (rafRef.current !== -1) {
      rafRef.current = requestAnimationFrame(drawMinimap);
    }
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawMinimap);
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = -1;
    };
  }, [drawMinimap]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const done = tasks.filter(t => t.completed).length;
  const total = tasks.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
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
    <div className="w-full h-full select-none font-mono" style={{ position: "relative" }}>

      {/* ═══════════ ROLE REVEAL BANNER ═══════════ */}
      {roleBanner && myRole && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10001,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
          background: myRole === "imposter"
            ? "radial-gradient(ellipse at center, rgba(220,38,38,0.18) 0%, transparent 70%)"
            : "radial-gradient(ellipse at center, rgba(0,255,240,0.1) 0%, transparent 70%)",
          animation: "fadeInOut 4s ease forwards",
        }}>
          <div style={{
            textAlign: "center",
            border: `2px solid ${myRole === "imposter" ? "rgba(220,38,38,0.7)" : "rgba(0,255,240,0.5)"}`,
            borderRadius: 4,
            padding: "28px 60px",
            background: myRole === "imposter" ? "rgba(10,4,4,0.92)" : "rgba(4,10,14,0.92)",
            boxShadow: myRole === "imposter"
              ? "0 0 60px rgba(220,38,38,0.3), inset 0 0 40px rgba(220,38,38,0.05)"
              : "0 0 60px rgba(0,255,240,0.2), inset 0 0 40px rgba(0,255,240,0.05)",
          }}>
            <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgba(148,163,184,0.6)", marginBottom: 10 }}>ROLE ASSIGNMENT</div>
            <div style={{
              fontSize: 42, fontWeight: 900, letterSpacing: "0.15em",
              color: myRole === "imposter" ? "#ef4444" : "#00fff0",
              textShadow: myRole === "imposter"
                ? "0 0 30px rgba(239,68,68,0.8)"
                : "0 0 30px rgba(0,255,240,0.8)",
              fontFamily: "monospace",
            }}>
              {myRole === "imposter" ? "⚡ IMPOSTER" : "◆ CREWMATE"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", marginTop: 10, letterSpacing: "0.1em" }}>
              {myRole === "imposter" ? "Sabotage the crew. Use your abilities wisely." : "Complete your tasks. Find the imposter."}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ CODING PUZZLE POPUP — gamified floating modal ═══════════ */}
      {puzzleOpen && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 9999,
          background: "rgba(2, 5, 10, 0.82)",
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          pointerEvents: "auto",
        }}>

          {/* ── HUD Corner brackets ── */}
          {[
            { top: 0, left: 0, borderTop: "2px solid #00fff0", borderLeft: "2px solid #00fff0" },
            { top: 0, right: 0, borderTop: "2px solid #00fff0", borderRight: "2px solid #00fff0" },
            { bottom: 0, left: 0, borderBottom: "2px solid #00fff0", borderLeft: "2px solid #00fff0" },
            { bottom: 0, right: 0, borderBottom: "2px solid #00fff0", borderRight: "2px solid #00fff0" },
          ].map((s, i) => (
            <div key={i} style={{
              position: "absolute", width: 20, height: 20, zIndex: 10001, ...s,
            }} />
          ))}

          {/* ── Main modal container ── */}
          <div style={{
            width: "78vw", height: "84vh",
            background: "#080d14",
            border: "1px solid rgba(0,255,240,0.2)",
            borderRadius: 6,
            boxShadow: "0 0 0 1px rgba(0,255,240,0.04), 0 0 80px rgba(0,255,240,0.1), 0 30px 100px rgba(0,0,0,0.7)",
            display: "flex", flexDirection: "column",
            overflow: "hidden", position: "relative",
          }}>

            {/* Scanlines overlay */}
            <div style={{
              position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
              backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,255,240,0.012) 3px, rgba(0,255,240,0.012) 4px)",
            }} />

            {/* Time Bomb overlay */}
            {bombActive && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none",
                border: `3px solid ${bombLeft <= 5 ? "#ef4444" : "#f97316"}`,
                borderRadius: 6,
                boxShadow: `inset 0 0 60px ${bombLeft <= 5 ? "rgba(239,68,68,0.25)" : "rgba(249,115,22,0.15)"}`,
                animation: bombLeft <= 5 ? "pulse 0.5s ease infinite" : undefined,
              }}>
                <div style={{
                  position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
                  background: bombLeft <= 5 ? "#ef4444" : "#f97316",
                  color: "#000", fontWeight: 900, fontFamily: "monospace",
                  fontSize: 13, letterSpacing: "0.15em",
                  padding: "3px 18px", borderRadius: 20,
                  boxShadow: "0 0 20px rgba(239,68,68,0.6)",
                }}>
                  💣 TIME BOMB — {bombLeft}s
                </div>
              </div>
            )}

            {/* Code Delay frozen overlay */}
            {inputFrozen && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 19, pointerEvents: "none",
                background: "rgba(59,130,246,0.07)",
                border: "2px solid rgba(59,130,246,0.4)",
                borderRadius: 6,
              }}>
                <div style={{
                  position: "absolute", top: "50%", left: "50%",
                  transform: "translate(-50%,-50%)",
                  background: "rgba(10,20,40,0.95)",
                  border: "1px solid rgba(59,130,246,0.5)",
                  borderRadius: 8, padding: "16px 32px", textAlign: "center",
                  color: "#3b82f6", fontFamily: "monospace", fontWeight: 700,
                  letterSpacing: "0.1em", fontSize: 14,
                  boxShadow: "0 0 40px rgba(59,130,246,0.3)",
                }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>⏸</div>
                  INPUT JAMMED — {frozenLeft}s
                </div>
              </div>
            )}

            {/* ── Header bar ── */}
            <div style={{
              height: 48, flexShrink: 0, zIndex: 1,
              background: "rgba(0,255,240,0.03)",
              borderBottom: "1px solid rgba(0,255,240,0.15)",
              display: "flex", alignItems: "center", padding: "0 18px", gap: 14,
            }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#00fff0", letterSpacing: "0.2em", fontFamily: "monospace" }}>
                ⬡ TASK TERMINAL
              </span>
              <div style={{ width: 1, height: 16, background: "rgba(0,255,240,0.2)" }} />
              {puzzle && (<>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                  background: "rgba(0,255,240,0.08)", border: "1px solid rgba(0,255,240,0.2)",
                  color: "#00fff0", borderRadius: 4, padding: "2px 10px",
                }}>{puzzle.domain}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                  background: "rgba(255,170,0,0.08)", border: "1px solid rgba(255,170,0,0.2)",
                  color: "#ffaa00", borderRadius: 4, padding: "2px 10px",
                }}>{puzzle.language}</span>
              </>)}
              <div style={{ flex: 1 }} />
              {/* Submit button */}
              <button onClick={submitPuzzle}
                disabled={submitting || !puzzle || !!puzzleResult?.passed}
                style={{
                  padding: "6px 20px", borderRadius: 6, fontFamily: "monospace",
                  border: puzzleResult?.passed ? "1px solid rgba(57,255,20,0.5)" : "1px solid rgba(0,255,240,0.35)",
                  background: puzzleResult?.passed ? "rgba(57,255,20,0.12)" : submitting ? "rgba(0,255,240,0.03)" : "rgba(0,255,240,0.1)",
                  color: puzzleResult?.passed ? "#39ff14" : submitting ? "rgba(0,255,240,0.3)" : "#00fff0",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
                  cursor: submitting || !puzzle || puzzleResult?.passed ? "default" : "pointer",
                  boxShadow: puzzleResult?.passed ? "0 0 14px rgba(57,255,20,0.3)" : "none",
                  transition: "all 0.18s",
                }}>
                {puzzleResult?.passed ? "✓ SOLVED" : submitting ? "RUNNING…" : "▶ RUN & SUBMIT"}
              </button>
              {puzzleResult?.passed && (
                <button onClick={closePuzzle} style={{
                  padding: "6px 18px", borderRadius: 6, fontFamily: "monospace",
                  border: "1px solid rgba(57,255,20,0.4)", background: "rgba(57,255,20,0.1)",
                  color: "#39ff14", cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
                }}>CONTINUE →</button>
              )}
              <button onClick={closePuzzle}
                style={{
                  padding: "6px 14px", borderRadius: 6, fontFamily: "monospace",
                  border: "1px solid rgba(255,255,255,0.1)", background: "transparent",
                  color: "rgba(255,255,255,0.3)", cursor: "pointer",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", transition: "all 0.15s",
                }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = "rgba(255,51,85,0.5)"; el.style.color = "#ff3355"; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = "rgba(255,255,255,0.1)"; el.style.color = "rgba(255,255,255,0.3)"; }}
              >✕ ESC</button>
            </div>

            {/* ── Split body ── */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0, zIndex: 1 }}>

              {/* LEFT — problem */}
              <div style={{
                width: "38%", minWidth: 300,
                background: "rgba(255,255,255,0.01)",
                borderRight: "1px solid rgba(0,255,240,0.1)",
                overflowY: "auto", display: "flex", flexDirection: "column",
              }}>
                {loadingPuzzle ? (
                  <div style={{ padding: 40, color: "rgba(0,255,240,0.5)", fontSize: 13, fontFamily: "monospace" }}>⟳ Loading challenge…</div>
                ) : puzzle ? (
                  <div style={{ padding: "26px 28px 36px" }}>
                    <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#e6edf3", lineHeight: 1.3 }}>
                      {puzzle.id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </h2>
                    <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 12px",
                        background: "rgba(0,192,255,0.1)", color: "#00c0ff", border: "1px solid rgba(0,192,255,0.2)",
                      }}>Easy</span>
                      <span style={{ fontSize: 11, color: "rgba(148,163,184,0.45)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {puzzle.domain} · {puzzle.language}
                      </span>
                    </div>
                    <div style={{ height: 1, background: "rgba(0,255,240,0.08)", marginBottom: 20 }} />
                    <div style={{ fontSize: 14, color: "#c9d1d9", lineHeight: 1.8, marginBottom: 24 }}>
                      {puzzle.prompt}
                    </div>
                    {(puzzle as any).expectedOutput && (
                      <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#8b949e", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                          Example Output
                        </div>
                        <div style={{
                          background: "rgba(0,0,0,0.45)", border: "1px solid rgba(0,255,240,0.12)",
                          borderRadius: 6, padding: "12px 16px", fontFamily: "monospace",
                          fontSize: 13, color: "#39ff14",
                        }}>
                          <span style={{ color: "#8b949e", fontSize: 10 }}>Output: </span>
                          {(puzzle as any).expectedOutput}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#8b949e", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                        Constraints
                      </div>
                      <ul style={{ margin: 0, padding: "0 0 0 16px", color: "#8b949e", fontSize: 13, lineHeight: 2 }}>
                        <li>Complete the function in the editor</li>
                        <li>Output must match exactly</li>
                        <li>Ctrl+C / Ctrl+V are allowed</li>
                      </ul>
                    </div>
                    {/* Result block inside left panel */}
                    {puzzleResult && (
                      <div style={{
                        marginTop: 24, borderRadius: 8, padding: "14px 16px",
                        background: puzzleResult.passed ? "rgba(57,255,20,0.07)" : "rgba(255,51,85,0.07)",
                        border: `1px solid ${puzzleResult.passed ? "rgba(57,255,20,0.25)" : "rgba(255,51,85,0.25)"}`,
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: puzzleResult.passed ? "#39ff14" : "#ff3355", marginBottom: 8 }}>
                          {puzzleResult.passed ? "✓ ACCEPTED" : "✗ WRONG ANSWER"}
                        </div>
                        {puzzleResult.stdout && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "rgba(148,163,184,0.4)", marginBottom: 2 }}>STDOUT</div>
                            <pre style={{ margin: 0, fontSize: 12, color: "#c9d1d9", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{puzzleResult.stdout}</pre>
                          </div>
                        )}
                        {puzzleResult.stderr && (
                          <div>
                            <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "rgba(255,51,85,0.5)", marginBottom: 2 }}>STDERR</div>
                            <pre style={{ margin: 0, fontSize: 11, color: "#ff6688", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{puzzleResult.stderr}</pre>
                          </div>
                        )}
                        {puzzleResult.time != null && (
                          <div style={{ marginTop: 6, fontSize: 9, color: "rgba(148,163,184,0.35)" }}>
                            {puzzleResult.time}s{puzzleResult.memory != null ? ` · ${puzzleResult.memory}kb` : ""}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: 40, fontSize: 13, color: "rgba(255,51,85,0.7)", fontFamily: "monospace" }}>
                    Failed to load. Is the puzzle service running on port 4000?
                  </div>
                )}
              </div>

              {/* RIGHT — editor */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

                {/* Editor tab */}
                <div style={{
                  height: 36, flexShrink: 0,
                  background: "rgba(0,0,0,0.3)",
                  borderBottom: "1px solid rgba(0,255,240,0.1)",
                  display: "flex", alignItems: "center", paddingLeft: 4,
                }}>
                  <div style={{
                    padding: "0 18px", height: "100%",
                    display: "flex", alignItems: "center", gap: 8,
                    borderBottom: "2px solid #00fff0", color: "#e6edf3",
                    fontSize: 11, fontWeight: 600, fontFamily: "monospace",
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", display: "inline-block",
                      background: puzzle?.language === "python" ? "#3b82f6" : "#f7c948",
                    }} />
                    solution.{puzzle?.language === "python" ? "py" : "js"}
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ paddingRight: 14, fontSize: 10, color: "rgba(148,163,184,0.25)", fontFamily: "monospace" }}>
                    Tab = 4 spaces · Ctrl+C/V enabled
                  </span>
                </div>

                {/* Textarea */}
                <textarea
                  value={puzzleCode}
                  onChange={e => setPuzzleCode(e.target.value)}
                  disabled={inputFrozen}
                  spellCheck={false}
                  autoFocus
                  style={{
                    flex: 1,
                    background: "transparent",
                    color: inputFrozen ? "rgba(148,163,184,0.3)" : "#e6edf3",
                    fontFamily: "'Cascadia Code','Fira Code','Courier New',Consolas,monospace",
                    fontSize: 13, lineHeight: 1.8,
                    padding: "16px 20px",
                    border: "none", outline: "none", resize: "none",
                    tabSize: 4, caretColor: "#00fff0", minHeight: 0,
                    cursor: inputFrozen ? "not-allowed" : "text",
                  }}
                  onKeyDown={e => {
                    if (e.key === "Tab") {
                      e.preventDefault();
                      const el = e.currentTarget;
                      const start = el.selectionStart, end = el.selectionEnd;
                      el.value = el.value.substring(0, start) + "    " + el.value.substring(end);
                      el.selectionStart = el.selectionEnd = start + 4;
                      setPuzzleCode(el.value);
                    }
                  }}
                />

                {/* Console / output */}
                <div style={{
                  height: puzzleResult ? 160 : 46, flexShrink: 0,
                  borderTop: "1px solid rgba(0,255,240,0.1)",
                  background: "rgba(0,0,0,0.4)",
                  transition: "height 0.22s ease", overflow: "hidden",
                }}>
                  <div style={{
                    height: 36, display: "flex", alignItems: "center",
                    padding: "0 14px", gap: 10,
                    borderBottom: puzzleResult ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(148,163,184,0.5)", textTransform: "uppercase", fontFamily: "monospace" }}>
                      Console
                    </span>
                    {puzzleResult && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 12px", fontFamily: "monospace",
                        background: puzzleResult.passed ? "rgba(57,255,20,0.1)" : "rgba(255,51,85,0.1)",
                        color: puzzleResult.passed ? "#39ff14" : "#ff3355",
                        border: `1px solid ${puzzleResult.passed ? "rgba(57,255,20,0.25)" : "rgba(255,51,85,0.25)"}`,
                      }}>{puzzleResult.passed ? "✓ Accepted" : "✗ Wrong Answer"}</span>
                    )}
                    {submitting && <span style={{ fontSize: 10, color: "rgba(0,255,240,0.5)", fontFamily: "monospace" }}>⟳ Running…</span>}
                    {puzzleResult?.time != null && (
                      <span style={{ fontSize: 10, color: "rgba(148,163,184,0.3)", fontFamily: "monospace" }}>
                        {puzzleResult.time}s{puzzleResult.memory != null ? ` · ${puzzleResult.memory}kb` : ""}
                      </span>
                    )}
                  </div>
                  {puzzleResult && (
                    <div style={{ padding: "8px 16px", overflowY: "auto", maxHeight: 115 }}>
                      {puzzleResult.stdout && (
                        <div style={{ marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "rgba(148,163,184,0.35)", marginRight: 6, fontFamily: "monospace" }}>STDOUT</span>
                          <pre style={{ display: "inline", margin: 0, fontSize: 12, color: "#c9d1d9", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{puzzleResult.stdout}</pre>
                        </div>
                      )}
                      {puzzleResult.stderr && (
                        <div>
                          <span style={{ fontSize: 9, color: "rgba(255,51,85,0.4)", marginRight: 6, fontFamily: "monospace" }}>STDERR</span>
                          <pre style={{ display: "inline", margin: 0, fontSize: 11, color: "#ff6688", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{puzzleResult.stderr}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ TOP — Room name + round + timer + progress pill ═══════════ */}
      <div
        style={{
          position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
          pointerEvents: "none",
          background: "rgba(8, 12, 20, 0.65)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 24, padding: "6px 20px",
          display: "flex", alignItems: "center", gap: 12,
        }}
      >
        {/* Room name */}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.15em",
          textTransform: "uppercase", color: "#94a3b8",
        }}>
          {room}
        </span>

        {/* Round indicator */}
        {roundNumber > 0 && (
          <>
            <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.12)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#00fff0", letterSpacing: "0.1em" }}>
              R{roundNumber}/3
            </span>
            {/* Timer */}
            <span style={{
              fontSize: 11, fontWeight: 900, fontFamily: "monospace",
              color: timeLeft <= 30 ? "#ef4444" : timeLeft <= 60 ? "#f97316" : "#94a3b8",
              letterSpacing: "0.08em",
              textShadow: timeLeft <= 30 ? "0 0 10px rgba(239,68,68,0.6)" : "none",
            }}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
            </span>
          </>
        )}

        {/* Mini progress bar */}
        <div style={{
          width: 100, height: 4, borderRadius: 4,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 4,
            background: complete
              ? "#39ff14"
              : "linear-gradient(90deg, #00c6ff, #00fff0)",
            boxShadow: complete ? "0 0 6px #39ff14" : "0 0 4px #00fff066",
            transition: "width 0.5s ease",
          }} />
        </div>

        {/* Count */}
        <span style={{
          fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
          color: complete ? "#39ff14" : "#00fff0",
        }}>
          {complete ? "✓" : `${done}/${total}`}
        </span>
      </div>

      {/* ═══════════ BOTTOM-LEFT — Circular minimap ═══════════ */}
      <div
        style={{
          position: "absolute", bottom: 20, left: 20,
          width: MINIMAP_SIZE, height: MINIMAP_SIZE,
          borderRadius: "50%",
          overflow: "hidden",
          pointerEvents: "none",
          boxShadow: "0 0 30px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.3)",
        }}
      >
        <canvas
          ref={minimapRef}
          width={MINIMAP_SIZE}
          height={MINIMAP_SIZE}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>

      {/* ═══════════ BOTTOM-RIGHT — Task panel (orangish) ═══════════ */}
      <div
        style={{
          position: "absolute", bottom: 20, right: 20,
          width: 220,
          pointerEvents: "auto",
          background: "rgba(255, 140, 50, 0.12)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 160, 60, 0.25)",
          borderRadius: 12,
          overflow: "hidden",
          transition: "all 0.3s ease",
          maxHeight: tasksOpen ? 380 : 44,
        }}
      >
        {/* Header — always visible */}
        <button
          onClick={() => setTasksOpen(o => !o)}
          style={{
            width: "100%", display: "flex", alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "transparent", border: "none",
            cursor: "pointer", color: "#ffbb66",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            fontFamily: "inherit",
          }}
        >
          <span>⬡ TASKS</span>
          <span style={{ fontSize: 11, color: complete ? "#39ff14" : "#ff9944" }}>
            {complete ? "DONE ✓" : `${done}/${total}`}
          </span>
        </button>

        {/* Task list — scrollable, shown when open */}
        <div style={{
          maxHeight: 320, overflowY: "auto",
          padding: tasksOpen ? "0 14px 12px" : 0,
          opacity: tasksOpen ? 1 : 0,
          transition: "opacity 0.2s",
        }}>
          {tasks.map(t => (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 0",
              borderBottom: "1px solid rgba(255,160,60,0.1)",
            }}>
              <span style={{
                fontSize: 8,
                color: t.completed ? "#39ff14" : "rgba(255,160,60,0.4)",
              }}>
                {t.completed ? "◆" : "■"}
              </span>
              <span style={{
                fontSize: 11, flex: 1,
                color: t.completed ? "#39ff14" : "#ddd",
                textDecoration: t.completed ? "line-through" : "none",
                opacity: t.completed ? 0.7 : 0.9,
              }}>
                {t.label}
              </span>
              {t.completed && <span style={{ fontSize: 10, color: "#39ff14" }}>✓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════ STATION PROMPT — center above buttons ═══════════ */}
      {nearStation && (
        <div
          style={{
            position: "absolute",
            bottom: 80,
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            background: "rgba(0,255,240,0.08)",
            backdropFilter: "blur(6px)",
            border: "1px solid rgba(0,255,240,0.3)",
            borderRadius: 8,
            padding: "6px 18px",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", color: "#00fff0" }}>
            Press{" "}
            <kbd style={{
              background: "#0d1117", border: "1px solid #00fff0",
              borderRadius: 3, padding: "1px 6px", fontSize: 11, color: "#00fff0",
            }}>E</kbd>
            {" "}to interact — {stationLabel}
          </span>
        </div>
      )}

      {/* ═══════════ BOTTOM-CENTER — Action buttons ═══════════ */}
      <div
        style={{
          position: "absolute", bottom: 20,
          left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: 10,
          pointerEvents: "auto",
        }}
      >
        {/* USE */}
        <button
          onClick={emitInteract}
          disabled={!nearStation}
          style={{
            border: nearStation ? "1px solid #00fff0" : "1px solid rgba(255,255,255,0.1)",
            color: nearStation ? "#00fff0" : "rgba(255,255,255,0.2)",
            background: nearStation ? "rgba(0,255,240,0.1)" : "rgba(255,255,255,0.03)",
            backdropFilter: "blur(6px)",
            boxShadow: nearStation ? "0 0 12px #00fff033" : "none",
            padding: "8px 18px", borderRadius: 8,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            cursor: nearStation ? "pointer" : "default",
            transition: "all 0.2s",
            fontFamily: "inherit",
          }}
        >
          [E] USE
        </button>

        {/* EMERGENCY */}
        <button
          onClick={emitMeeting}
          style={{
            border: "1px solid rgba(255,187,0,0.4)",
            color: "#ffbb00",
            background: "rgba(255,187,0,0.08)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 0 10px rgba(255,187,0,0.1)",
            padding: "8px 18px", borderRadius: 8,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            cursor: "pointer",
            transition: "all 0.2s",
            fontFamily: "inherit",
          }}
        >
          [M] MEETING
        </button>

        {/* REPORT */}
        <button
          onClick={emitReport}
          style={{
            border: "1px solid rgba(255,51,85,0.4)",
            color: "#ff3355",
            background: "rgba(255,51,85,0.08)",
            backdropFilter: "blur(6px)",
            boxShadow: "0 0 10px rgba(255,51,85,0.1)",
            padding: "8px 18px", borderRadius: 8,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            cursor: "pointer",
            transition: "all 0.2s",
            fontFamily: "inherit",
          }}
        >
          [R] REPORT
        </button>
      </div>

      {/* ═══════════ ABILITY NOTIFICATION (imposter confirmation) ═══════════ */}
      {abilityNotif && (
        <div style={{
          position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)",
          zIndex: 200, pointerEvents: "none",
          background: "rgba(10,4,4,0.92)",
          border: "1px solid rgba(239,68,68,0.4)",
          borderRadius: 8, padding: "8px 20px",
          color: "#ef4444", fontFamily: "monospace", fontWeight: 700,
          fontSize: 12, letterSpacing: "0.1em",
          boxShadow: "0 0 20px rgba(239,68,68,0.3)",
        }}>
          ⚡ {abilityNotif}
        </div>
      )}

      {/* ═══════════ ROUND LEADERBOARD OVERLAY ═══════════ */}
      {leaderboardOpen && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10002,
          background: "rgba(2, 5, 14, 0.88)",
          backdropFilter: "blur(10px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          pointerEvents: "auto",
        }}>
          <div style={{
            width: 480, background: "#080d14",
            border: "1px solid rgba(0,255,240,0.2)",
            borderRadius: 10,
            boxShadow: "0 0 80px rgba(0,255,240,0.12), 0 30px 80px rgba(0,0,0,0.7)",
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "18px 24px 14px",
              borderBottom: "1px solid rgba(0,255,240,0.12)",
              background: "rgba(0,255,240,0.03)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "rgba(148,163,184,0.5)", marginBottom: 4 }}>
                  {leaderboardRound === 0 ? "FINAL STANDINGS" : `END OF ROUND ${leaderboardRound} / 3`}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#00fff0", letterSpacing: "0.1em", fontFamily: "monospace" }}>
                  LEADERBOARD
                </div>
              </div>
              <button onClick={() => setLeaderboardOpen(false)} style={{
                background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.4)", cursor: "pointer",
                borderRadius: 6, padding: "6px 14px",
                fontSize: 10, fontFamily: "monospace", letterSpacing: "0.1em",
              }}>CLOSE ✕</button>
            </div>

            {/* Rows */}
            <div style={{ padding: "16px 24px 20px" }}>
              {leaderboardData.map((entry, i) => {
                const isSelf = entry.socketId === myPlayerId;
                const isImp = entry.role === "imposter";
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                return (
                  <div key={entry.socketId} style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "11px 14px", marginBottom: 6, borderRadius: 8,
                    background: isSelf
                      ? "rgba(0,255,240,0.06)"
                      : i === 0 ? "rgba(255,215,0,0.05)" : "rgba(255,255,255,0.02)",
                    border: isSelf
                      ? "1px solid rgba(0,255,240,0.2)"
                      : i === 0 ? "1px solid rgba(255,215,0,0.12)" : "1px solid rgba(255,255,255,0.05)",
                  }}>
                    <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{medal}</span>
                    <div style={{ flex: 1 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: isSelf ? "#00fff0" : "#e2e8f0",
                        fontFamily: "monospace",
                      }}>
                        {entry.name}{isSelf ? " (you)" : ""}
                      </span>
                      {(isImp || isSelf) && (
                        <span style={{
                          marginLeft: 8, fontSize: 8, fontWeight: 700,
                          borderRadius: 20, padding: "1px 8px",
                          background: isImp ? "rgba(239,68,68,0.15)" : "rgba(0,255,240,0.1)",
                          border: isImp ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(0,255,240,0.2)",
                          color: isImp ? "#ef4444" : "#00fff0",
                          letterSpacing: "0.1em",
                        }}>
                          {isImp ? "IMPOSTER" : "CREWMATE"}
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 15, fontWeight: 900, fontFamily: "monospace",
                      color: i === 0 ? "#ffd700" : "#94a3b8",
                    }}>
                      {entry.score.toLocaleString()} pts
                    </span>
                  </div>
                );
              })}
              {leaderboardData.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: "rgba(148,163,184,0.4)", fontSize: 13 }}>
                  No data yet.
                </div>
              )}
            </div>

            {/* Footer */}
            {leaderboardRound > 0 && leaderboardRound < 3 && (
              <div style={{
                padding: "10px 24px 16px",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                textAlign: "center",
                fontSize: 10, color: "rgba(148,163,184,0.4)", letterSpacing: "0.12em",
              }}>
                ⟳ Round {leaderboardRound + 1} starting soon…
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ IMPOSTER ABILITY HUD ═══════════ */}
      {myRole === "imposter" && (
        <div style={{
          position: "absolute", bottom: 80, right: 20,
          width: 230, zIndex: 100, pointerEvents: "auto",
          background: "rgba(20,4,4,0.88)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 10,
          boxShadow: "0 0 30px rgba(239,68,68,0.1)",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 14px",
            borderBottom: "1px solid rgba(239,68,68,0.2)",
            background: "rgba(239,68,68,0.07)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.2em", color: "#ef4444" }}>⚡ IMPOSTER ARSENAL</span>
          </div>

          {/* Abilities — single click to fire on ALL crewmates */}
          {[
            { id: "time_bomb",       icon: "💣", label: "Time Bomb",       desc: "20s countdown on ALL", cd: 40 },
            { id: "code_delay",      icon: "⏸",  label: "Code Delay",      desc: "Freeze all inputs 8s", cd: 30 },
            { id: "syntax_scramble", icon: "🔀", label: "Syntax Scramble", desc: "Shuffle all tasks",    cd: 50 },
          ].map(({ id, icon, label, desc, cd }) => {
            const onCd = (cooldowns[id] ?? 0) > 0;
            return (
              <button
                key={id}
                onClick={() => !onCd && fireAbility(id)}
                disabled={onCd}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 14px",
                  background: "transparent",
                  border: "none", borderBottom: "1px solid rgba(239,68,68,0.08)",
                  cursor: onCd ? "default" : "pointer",
                  opacity: onCd ? 0.45 : 1,
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { if (!onCd) e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", letterSpacing: "0.06em" }}>{label}</div>
                  <div style={{ fontSize: 8, color: "rgba(148,163,184,0.4)", marginTop: 1 }}>
                    {onCd ? `⟳ ${cooldowns[id]}s` : desc}
                  </div>
                </div>
                {onCd ? (
                  <div style={{ width: 28, height: 28, position: "relative" }}>
                    <svg viewBox="0 0 28 28" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="14" cy="14" r="10" fill="none" stroke="rgba(239,68,68,0.15)" strokeWidth="2" />
                      <circle cx="14" cy="14" r="10" fill="none" stroke="#ef4444" strokeWidth="2"
                        strokeDasharray={`${(1 - cooldowns[id] / cd) * 62.8} 62.8`}
                        strokeLinecap="round" />
                    </svg>
                    <span style={{
                      position: "absolute", inset: 0, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      fontSize: 7, color: "#ef4444", fontFamily: "monospace",
                    }}>{cooldowns[id]}</span>
                  </div>
                ) : (
                  <span style={{
                    fontSize: 8, color: "#ef4444", fontFamily: "monospace",
                    border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, padding: "2px 6px",
                  }}>FIRE</span>
                )}
              </button>
            );
          })}
        </div>
      )}

    </div>
  );
}
