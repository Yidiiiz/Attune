// Owns: re-reading the active palette after settings/history writes and window focus.
// Failure behavior: a failed refresh keeps the current palette; newer reads win.
"use client";
import { useEffect } from "react";
import { send } from "@/components/tasks/writes";
import { previewTheme } from "./theme-preview";
import type { Theme } from "@/lib/theme/tokens";
export default function ThemeController() {
  useEffect(() => {
    let issued = 0, alive = true;
    const reload = async () => {
      const ticket = ++issued;
      const [settings, themes] = await Promise.all([send("/api/settings"), send("/api/settings/themes")]);
      if (!alive || ticket !== issued || settings.error || themes.error) return;
      const name = (settings.data.settings as { theme: string }).theme;
      previewTheme(name, (themes.data.themes as Theme[]).find(theme => theme.name === name));
    };
    window.addEventListener("settings:changed", reload); window.addEventListener("history:changed", reload); window.addEventListener("focus", reload);
    return () => { alive = false; window.removeEventListener("settings:changed", reload); window.removeEventListener("history:changed", reload); window.removeEventListener("focus", reload); };
  }, []);
  return null;
}
