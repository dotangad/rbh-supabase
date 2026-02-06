"use client";

import { useRef, useEffect } from "react";
import { GameEngine } from "@/game/engine";

export default function GameCanvas({ seed }: { seed: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const engine = new GameEngine(canvas, seed);
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
  }, [seed]);

  return <canvas ref={canvasRef} className="block h-screen w-screen bg-black" />;
}
