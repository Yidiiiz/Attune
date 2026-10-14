// Owns: day minutes and ordered block editing, including times past midnight (§11.1).
// Failure behavior: retain invalid drafts; server validation refuses them inline in the section.
"use client";
import type { Settings } from "@/lib/store/settings";
import styles from "./Settings.module.css";
export default function DaySettings({ value, onChange, onSave }: { value: Settings["day"]; onChange: (next: Settings["day"]) => void; onSave: () => void }) {
  const minute = (label: string, current: number, change: (next: number) => void, max = 2880) => <label>{label}<input type="number" min="0" max={max} value={current} onChange={event => change(Number(event.target.value))} onBlur={onSave} /></label>;
  return <>
    <p className={styles.note}>Minutes after midnight: 600 is 10:00; 1560 is 02:00 the next day.</p>
    <div className={styles.row}>{minute("Day start", value.startMin, startMin => onChange({ ...value, startMin }), 1439)}{minute("Day end", value.endMin, endMin => onChange({ ...value, endMin }))}{minute("Break minutes", value.breakMin, breakMin => onChange({ ...value, breakMin }), 240)}</div>
    {value.blocks.map(([start, end], index) => <div className={styles.row} key={index}>
      {minute(`Block ${index + 1} start`, start, next => onChange({ ...value, blocks: value.blocks.map((block, at) => at === index ? [next, end] : block) }))}
      {minute(`Block ${index + 1} end`, end, next => onChange({ ...value, blocks: value.blocks.map((block, at) => at === index ? [start, next] : block) }))}
      <button onClick={() => { onChange({ ...value, blocks: value.blocks.filter((_, at) => at !== index) }); onSave(); }}>Remove block {index + 1}</button>
    </div>)}
    <button onClick={() => { const start = value.blocks.at(-1)?.[1] ?? value.startMin; onChange({ ...value, blocks: [...value.blocks, [start, Math.min(start + 60, value.endMin)]] }); onSave(); }}>Add block</button>
  </>;
}
