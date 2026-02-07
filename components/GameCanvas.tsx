"use client";

import { useRef, useEffect } from "react";
import { GameEngine } from "@/game/engine";

export default function GameCanvas({
  seed,
  onGameOver,
}: {
  seed: number;
  onGameOver?: (score: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const engine = new GameEngine(canvas, seed, onGameOver);
    engine.start();

    const onResize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      engine.resize(canvas.width, canvas.height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      engine.stop();
      window.removeEventListener("resize", onResize);
    };
  }, [seed, onGameOver]);

  return <canvas ref={canvasRef} className="block h-screen w-screen bg-black" />;
}
