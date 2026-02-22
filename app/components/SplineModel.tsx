"use client";

import { useState, memo } from "react";

// ─── Spline viewer embed URL ────────────────────────────────
// Community files use the iframe-based viewer — no .splinecode needed.
// Format: https://my.spline.design/{slug}/
const VIEWER_URL =
  "https://my.spline.design/darkmetalabstractelements-Hhm7cbyB5UEonQHhMMsCueL1/";

// ─── Loading skeleton while the 3D scene downloads ─────────
function SplineSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0b0b1a]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-16 h-16 animate-pulse"
          style={{ background: "rgba(124,92,252,0.1)", border: "2px solid rgba(124,92,252,0.15)" }}
        />
        <p className="font-pixel text-[8px] text-[#333355] animate-pulse tracking-widest">
          LOADING…
        </p>
      </div>
    </div>
  );
}

interface SplineModelProps {
  className?: string;
  sceneUrl?: string;
}

/**
 * Spline 3D scene embedded via iframe viewer.
 * Fades in smoothly once the iframe finishes loading.
 * Zero-dependency — no @splinetool/runtime bundle needed at all.
 */
function SplineModelInner({ className, sceneUrl }: SplineModelProps) {
  const [ready, setReady] = useState(false);

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className ?? ""}`}
      style={{ minHeight: 300 }}
    >
      {/* Skeleton placeholder until iframe loads */}
      {!ready && (
        <div className="absolute inset-0 z-10">
          <SplineSkeleton />
        </div>
      )}

      {/* Spline iframe — fades in after onLoad */}
      <iframe
        src={sceneUrl ?? VIEWER_URL}
        onLoad={() => setReady(true)}
        className="w-full h-full border-0 transition-opacity duration-700 ease-out"
        style={{ opacity: ready ? 1 : 0 }}
        title="3D Scene"
        allow="autoplay; fullscreen"
        loading="lazy"
      />
    </div>
  );
}

export default memo(SplineModelInner);
