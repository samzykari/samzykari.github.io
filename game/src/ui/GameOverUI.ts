import { RunStats } from "../types";

/**
 * Updates the game-over screen with run statistics.
 */
export class GameOverUI {
  show(stats: RunStats, resultText = ""): void {
    const resultEl = document.getElementById("go-result");
    if (resultEl) {
      resultEl.textContent = resultText;
      resultEl.classList.toggle("hidden", resultText.length === 0);
    }
    document.getElementById("go-score")!.textContent =
      stats.score.toLocaleString();
    document.getElementById("go-coins")!.textContent =
      stats.coins.toString();
    document.getElementById("go-near-misses")!.textContent =
      stats.nearMisses.toString();
    document.getElementById("go-max-combo")!.textContent =
      `x${stats.maxMultiplier}`;
    document.getElementById("go-distance")!.textContent =
      `${stats.distance}m`;
  }
}
