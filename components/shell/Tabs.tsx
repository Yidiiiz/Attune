// Owns: the top bar — the three tab links and the settings gear.
// Search (PROJECT.md §10.0) arrives with the phase that gives it a backend; the sync indicator is here.
//
// Failure behavior: usePathname returning nothing leaves no tab highlighted; navigation still works
// because these are plain links.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SyncStatus from "./SyncStatus";
import styles from "./Tabs.module.css";

const TABS = [
  { href: "/", label: "Today" },
  { href: "/chat", label: "Chat" },
  { href: "/calendar", label: "Calendar" },
] as const;

export default function Tabs() {
  const pathname = usePathname();

  return (
    <nav className={styles.bar}>
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
