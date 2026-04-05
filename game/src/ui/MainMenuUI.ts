/**
 * Controls the main menu screen.
 */
export class MainMenuUI {
  /** Update the coin counter displayed on the menu. */
  setCoins(coins: number): void {
    const el = document.getElementById("menu-coins");
    if (el) el.textContent = coins.toString();
  }
}
