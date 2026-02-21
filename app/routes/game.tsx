import { useEffect, useState, type ComponentType } from "react";
import type { Route } from "./+types/game";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "hardReset — Game" },
    { name: "description", content: "Enter the game world" },
  ];
}

export default function GameRoute() {
  const [GameComponent, setGameComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    // Dynamic import — only runs client‑side so Phaser never touches SSR
    import("~/game/PhaserGame").then((mod) => {
      setGameComponent(() => mod.default);
    });
  }, []);

  if (!GameComponent) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a2e] text-gray-400">
        Loading game…
      </div>
    );
  }

  return <GameComponent />;
}
