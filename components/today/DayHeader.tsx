// Owns: the Today header (PROJECT.md §10.1) — day navigation, the date, the Today button, the
// Schedule toggle, and the slot the weather element occupies when there is one.
//
// The grid is `1fr auto 1fr`, so the two side columns are always the same width and the date sits
// on the centre of the page no matter what appears beside it. That is what §10.1's "nothing shifts"
// asks for: weather arriving after its fetch, or disappearing when the location is cleared, must
// not move the date a pixel — and with `auto 1fr auto` it would, because the centre column would
// simply start wherever the left column ended.
//
// Failure behavior: navigation is plain links, so it works with JavaScript still loading; the
// Schedule toggle is the only control here that needs the client.

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { addDays } from "@/lib/schedule/dates";
import { describeDate } from "./format";
import styles from "./DayHeader.module.css";

export interface DayHeaderProps {
  date: string;
  today: string;
  scheduleOpen: boolean;
  onToggleSchedule: () => void;
  weather?: ReactNode;
}

export default function DayHeader({ date, today, scheduleOpen, onToggleSchedule, weather }: DayHeaderProps) {
  const { weekday, long } = describeDate(date, today);
  const isToday = date === today;

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Link className={styles.arrow} href={`/?date=${addDays(date, -1)}`} aria-label="Previous day" title="Previous day">
          ←
        </Link>
        {weather}
      </div>

      <div className={styles.centre}>
        <div className={styles.weekday}>{isToday ? "Today" : weekday}</div>
        <div className={styles.date}>
          {isToday ? `${weekday}, ${long}` : long}
        </div>
        {isToday ? null : (
          <Link className={styles.todayButton} href="/">
            Back to today
          </Link>
        )}
      </div>

      <div className={styles.right}>
        <button
          type="button"
          className={`${styles.toggle} ${scheduleOpen ? styles.toggleOn : ""}`}
          onClick={onToggleSchedule}
          aria-pressed={scheduleOpen}
        >
          Schedule
        </button>
        <Link className={styles.arrow} href={`/?date=${addDays(date, 1)}`} aria-label="Next day" title="Next day">
          →
        </Link>
      </div>
    </header>
  );
}
