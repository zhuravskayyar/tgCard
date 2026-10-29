// Cardastika has a single parchment theme; book-theme selectors key off this attribute.
document.documentElement.dataset.gameTheme = "light";

try {
  window.localStorage.removeItem("cardastika.game-theme");
} catch {
  // Storage is optional; the attribute above already selects the only theme.
}
