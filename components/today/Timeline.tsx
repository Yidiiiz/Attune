// Owns: Schedule mode (PROJECT.md §10.1) — the day drawn against the clock, with the focus list
// packed into the gaps around whatever is already pinned to a time, and a "Didn't fit" list under
// it. The layout itself is `packDay` in `lib/schedule/timeline.ts`; this file draws the result and
// lets a block be moved.
//
// `now` arrives as a number from the server rather than being read here, so the window the server
// rendered and the window the client draws are the same one and there is no hydration mismatch.
//
// Failure behavior: a day whose end is before its start (an evening past `day.endMin`) packs to
// nothing and says so. A move that the server refuses leaves the block where it was — the write is
// asked for on release and the list is re-read from the server, never patched locally.

"use client";

import { useState } from "react";
import type { Task } from "@/lib/store/tasks";
import type { Settings } from "@/lib/store/settings";
import { dayWindow, packDay, unplaced } from "@/lib/schedule/timeline";
import { clockLabel, durationLabel } from "@/components/tasks/format";
import styles from "./Timeline.module.css";

/** Generous clock spacing in a bounded scroll area; durations remain proportional. */
const SCALE = 1.6;

/** Moves land on a five-minute grid: finer than that is a precision the estimate does not have. */
const STEP_MIN = 5;

export interface TimelineProps {
  focus: Task[];
  fixed: Task[];
  settings: Settings;
  viewDate: string;
  nowMs: number;
  onSchedule: (task: Task, startMin: number) => void;
}

export default function Timeline({ focus, fixed, settings, viewDate, nowMs, onSchedule }: TimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offset: number } | null>(null);

  const now = new Date(nowMs);
  const bounds = dayWindow(viewDate, settings, now);
  const blocks = packDay({ focus, fixed, now, viewDate, settings });
  const scheduledBlocks = blocks.filter(block => block.taskId);
  const selected = scheduledBlocks.find(block => block.taskId === selectedId) ?? scheduledBlocks[0];
  const didNotFit = unplaced(focus, blocks);

  const byId = new Map<string, Task>();
  for (const task of [...focus, ...fixed]) byId.set(task.id, task);

  if (bounds.end <= bounds.start) {
    return (
      <section className={styles.timeline} aria-label="Day schedule">
        <p className={styles.empty}>
          The day is over — it ended at {clockLabel(settings.day.endMin)}. Tomorrow&rsquo;s timeline is one arrow away.
        </p>
      </section>
    );
  }

  const height = (bounds.end - bounds.start) * SCALE;
  const hours: number[] = [];
  for (let minute = Math.ceil(bounds.start / 60) * 60; minute <= bounds.end; minute += 60) hours.push(minute);

  const startDrag = (event: React.PointerEvent, taskId: string) => {
    if (event.button !== 0) return;
    const origin = event.clientY;
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);

    const move = (pointer: PointerEvent) => {
      const minutes = Math.round((pointer.clientY - origin) / SCALE / STEP_MIN) * STEP_MIN;
      setDragging({ id: taskId, offset: minutes });
    };

    const finish = (pointer: PointerEvent) => {
      element.releasePointerCapture(pointer.pointerId);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", finish);
      element.removeEventListener("pointercancel", cancel);

      const minutes = Math.round((pointer.clientY - origin) / SCALE / STEP_MIN) * STEP_MIN;
      setDragging(null);
      const block = blocks.find((candidate) => candidate.taskId === taskId);
      const task = byId.get(taskId);
      if (!block || !task || minutes === 0) return;

      const startMin = Math.min(Math.max(block.startMin + minutes, bounds.start), bounds.end - 1);
      onSchedule(task, startMin);
    };

    const cancel = () => {
      setDragging(null);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", finish);
      element.removeEventListener("pointercancel", cancel);
    };

    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", cancel);
  };

  return (
    <section className={styles.timeline} aria-label="Day schedule">
      <div className={styles.scheduleHeading}><h2>Day plan</h2><span>Drag to move · select to edit</span></div>
      {selected ? <div className={styles.selection}>
        <label className={styles.itemPicker}><span className={styles.visuallyHidden}>Schedule item</span>
          <select aria-label="Schedule item" value={selected.taskId} onChange={event => setSelectedId(event.target.value)}>
            {scheduledBlocks.map(block => <option key={block.taskId} value={block.taskId}>{byId.get(block.taskId!)?.title}</option>)}
          </select>
        </label>
        <label className={styles.at}><span>Start</span><input type="time" step={STEP_MIN * 60}
          aria-label={`Start time for ${byId.get(selected.taskId!)?.title}`}
          value={clockLabel(selected.startMin)} onChange={event => {
            const [hours, minutes] = event.target.value.split(":").map(Number);
            const task = byId.get(selected.taskId!);
            if (task && Number.isFinite(hours) && Number.isFinite(minutes)) onSchedule(task, hours * 60 + minutes);
          }} /></label>
      </div> : null}
      <div className={styles.viewport}>
      <div className={styles.column} style={{ height }}>
        {hours.map(minute => <div key={minute} className={`${styles.timeTick} ${minute === bounds.start ? styles.firstTick : ""} ${minute === bounds.end ? styles.lastTick : ""}`} style={{ top: (minute - bounds.start) * SCALE }} data-ui="timeline-hour"><span>{clockLabel(minute)}</span></div>)}
        {blocks.filter(block => block.kind !== "gap").map((block) => {
          const task = block.taskId ? byId.get(block.taskId) : undefined;
          const offset = dragging && dragging.id === block.taskId ? dragging.offset : 0;
          const top = (block.startMin - bounds.start + offset) * SCALE;
          const size = (block.endMin - block.startMin) * SCALE;

          return (
            <div
              key={`${block.kind}-${block.startMin}-${block.taskId ?? ""}`}
              className={`${styles.block} ${styles[block.kind]} ${offset !== 0 ? styles.moving : ""} ${selected?.taskId && selected.taskId === block.taskId ? styles.selected : ""} ${size < 22 ? styles.compact : ""}`}
              style={{ top, height: Math.max(size, 2) }}
              role={task ? "button" : undefined}
              tabIndex={task ? 0 : undefined}
              aria-label={task ? `Schedule ${task.title}` : undefined}
              aria-pressed={task ? selected?.taskId === task.id : undefined}
              onClick={task ? () => setSelectedId(task.id) : undefined}
              onKeyDown={task ? event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(task.id); } } : undefined}
              onPointerDown={task ? (event) => startDrag(event, task.id) : undefined}
            >
              <span className={styles.clock}>{clockLabel(block.startMin + offset)}</span>
              {task ? (
                <>
                  <span className={styles.blockTitle}>{task.title}</span>
                  <span className={styles.blockEstimate}>{durationLabel(block.endMin - block.startMin)}</span>
                </>
              ) : (
                <span className={styles.blockTitle}>{block.kind === "break" ? "Break" : ""}</span>
              )}
            </div>
          );
        })}
      </div>

      </div>

      {didNotFit.length > 0 ? (
        <div className={styles.didNotFit}>
          <h3>Didn&rsquo;t fit</h3>
          <ul>
            {didNotFit.map((task) => (
              <li key={task.id}>
                {task.title}
                <span className={styles.muted}>{durationLabel(task.estimateMin ?? 30)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className={styles.hint}>
        Suggested blocks stay flexible until you move or set a time.
      </p>
    </section>
  );
}
