import { EngineManager } from "@engine/EngineManager";
import { Game } from "./Game";

console.log("[INIT] main.ts loaded");

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element #gameCanvas not found");

const isMobile =
  window.matchMedia?.("(pointer: coarse)").matches ||
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0;

const requestFullscreenOnce = () => {
  if (!isMobile) return;
  if (document.fullscreenElement) return;
  const target = canvas.parentElement ?? canvas;
  target.requestFullscreen?.().catch(() => {
    // Ignore fullscreen rejection on unsupported browsers.
  });
};

window.addEventListener("pointerdown", requestFullscreenOnce, { once: true });
window.addEventListener("touchstart", requestFullscreenOnce, { once: true });

console.log("[INIT] Creating EngineManager...");
const engine = new EngineManager(canvas);
console.log("[INIT] Creating Game...");
try {
  new Game(engine);
  console.log("[INIT] Game created successfully");
} catch (e) {
  console.error("[INIT] Game creation FAILED:", e);
}
