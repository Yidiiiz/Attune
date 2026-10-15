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
    const updateIcon = () => {
      const style = getComputedStyle(document.documentElement);
      const bg = style.getPropertyValue("--bg").trim();
      const fg = style.getPropertyValue("--fg").trim();
      let icon = document.getElementById("attune-app-icon") as HTMLLinkElement | null;
      if (!icon) { icon = document.createElement("link"); icon.rel = "icon"; icon.id = "attune-app-icon"; document.head.append(icon); }
      icon.href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${bg}"/><path d="M22 23A11 11 0 0 1 11 5a11 11 0 1 0 11 18Z" fill="${fg}"/></svg>`)}`;
    };
    updateIcon();
    const observer = new MutationObserver(updateIcon);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-base", "style"] });
    const themeStyle = document.getElementById("custom-theme");
    if (themeStyle) observer.observe(themeStyle, { childList: true, characterData: true, subtree: true });
    const reload = async () => {
      const ticket = ++issued;
      const [settings, themes] = await Promise.all([send("/api/settings"), send("/api/settings/themes")]);
      if (!alive || ticket !== issued || settings.error || themes.error) return;
      const name = (settings.data.settings as { theme: string }).theme;
      previewTheme(name, (themes.data.themes as Theme[]).find(theme => theme.name === name));
    };
    window.addEventListener("settings:changed", reload); window.addEventListener("history:changed", reload); window.addEventListener("focus", reload);
    return () => { alive = false; observer.disconnect(); window.removeEventListener("settings:changed", reload); window.removeEventListener("history:changed", reload); window.removeEventListener("focus", reload); };
  }, []);
  return null;
}
