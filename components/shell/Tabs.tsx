// Owns: the top bar — the three tab links, the search field, the sync indicator and the settings gear.
// Search is its own component because it is the only part of this bar with state (§10.0).
//
// Failure behavior: usePathname returning nothing leaves no tab highlighted; navigation still works
// because these are plain links.

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { openComposer } from "@/components/composer/ComposerButton";
import Search from "./Search";
import SyncStatus from "./SyncStatus";
import styles from "./Tabs.module.css";

const TABS = [
  { href: "/", label: "Today" },
  { href: "/chat", label: "Chat" },
  { href: "/calendar", label: "Calendar" },
] as const;

export default function Tabs() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!TABS.some(tab => tab.href === pathname)) return;
      if (document.querySelector('[role="dialog"][aria-label="Composer"]:not([inert])')) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
      if (event.key === "/" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        openComposer();
      } else if (event.key === "Tab") {
        event.preventDefault();
        const current = TABS.findIndex(tab => tab.href === pathname);
        router.push(TABS[(current + (event.shiftKey ? 2 : 1)) % TABS.length].href, { scroll: false });
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [pathname, router]);

  return (
    <nav className={styles.bar} aria-label="Main">
      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${styles.tab} ${pathname === tab.href ? styles.active : ""}`}
            aria-current={pathname === tab.href ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <div className={styles.spacer} />
      <Search />
      <SyncStatus />
      <Link href="/settings" className={styles.gear} aria-label="Settings" title="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.03z" />
        </svg>
      </Link>
    </nav>
  );
}
