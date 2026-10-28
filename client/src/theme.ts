export type GameTheme = "dark" | "light";

const THEME_STORAGE_KEY = "cardastika.game-theme";

export function getGameTheme(): GameTheme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function setGameTheme(theme: GameTheme) {
  document.documentElement.dataset.gameTheme = theme;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The current tab still gets the selected theme when storage is unavailable.
  }
}

document.documentElement.dataset.gameTheme = getGameTheme();
