// Owns: applying a validated theme preview to the current document (§11.3).
// Failure behavior: invalid themes throw before DOM mutation; absent custom themes use light.
import { ThemeSchema, themeCss } from "@/lib/theme/tokens";
import type { Theme } from "@/lib/theme/tokens";
export function previewTheme(name: string, theme?: Theme): void {
  const custom = theme ? ThemeSchema.parse(theme) : undefined;
  const root = document.documentElement;
  root.setAttribute("data-theme", custom?.name ?? (name === "dark" ? "dark" : "light"));
  root.setAttribute("data-theme-base", custom?.base ?? (name === "dark" ? "dark" : "light"));
  let style = document.getElementById("custom-theme");
  if (!style) { style = document.createElement("style"); style.id = "custom-theme"; document.head.appendChild(style); }
  style.textContent = custom ? themeCss(custom) : "";
}
