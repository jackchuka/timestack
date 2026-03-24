const STORAGE_KEY = "timestack-theme";

const THEMES = [
  { id: "dark", label: "Dark", swatch: "#1a1a2e" },
  { id: "light", label: "Light", swatch: "#f8fafc" },
  { id: "high-contrast", label: "High Contrast", swatch: "#000000" },
  { id: "warm", label: "Warm", swatch: "#1c1410" },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

export function loadTheme(): ThemeId {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && THEMES.some((t) => t.id === saved)) return saved as ThemeId;
  return "dark";
}

export function applyTheme(id: ThemeId): void {
  if (id === "dark") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", id);
  }
  localStorage.setItem(STORAGE_KEY, id);
}

export function buildThemeSelector(): HTMLElement {
  let current = loadTheme();

  const wrap = document.createElement("div");
  wrap.className = "editor-theme-selector";

  THEMES.forEach((theme) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "editor-theme-selector__btn" +
      (theme.id === current ? " editor-theme-selector__btn--active" : "");

    const swatch = document.createElement("span");
    swatch.className = "editor-theme-selector__swatch";
    swatch.style.backgroundColor = theme.swatch;

    const label = document.createElement("span");
    label.textContent = theme.label;

    btn.append(swatch, label);

    btn.addEventListener("click", () => {
      current = theme.id;
      applyTheme(theme.id);
      wrap.querySelectorAll(".editor-theme-selector__btn").forEach((b, i) => {
        b.classList.toggle("editor-theme-selector__btn--active", THEMES[i].id === current);
      });
    });

    wrap.appendChild(btn);
  });

  return wrap;
}
