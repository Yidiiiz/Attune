// Owns: optimistic section drafts and serialized saves (§11.1).
// Failure behavior: retain refused values with inline section errors; unrelated drafts survive saves.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { send } from "@/components/tasks/writes";
import type { Settings } from "@/lib/store/settings";
import type { Section } from "@/lib/settings/sections";
export function useSettings(initial: Settings) {
  const [value, setValue] = useState(initial), latest = useRef(initial);
  const [errors, setErrors] = useState<Partial<Record<Section, string>>>({});
  const [saving, setSaving] = useState(0), [saved, setSaved] = useState("");
  const edited = useRef(0), reads = useRef(0);
  const queue = useRef(Promise.resolve()); const router = useRouter();
  function change<K extends keyof Settings>(section: K, next: Settings[K]): void {
    edited.current++;
    latest.current = { ...latest.current, [section]: next }; setValue(latest.current);
  }
  const reload = useCallback(async () => {
    const ticket = ++reads.current;
    await queue.current;
    const revision = edited.current;
    const answer = await send("/api/settings");
    if (!answer.error && ticket === reads.current && revision === edited.current) { latest.current = answer.data.settings as Settings; setValue(latest.current); }
  }, []);
  useEffect(() => { window.addEventListener("history:changed", reload); return () => window.removeEventListener("history:changed", reload); }, [reload]);
  function save(section: Section, override?: unknown): Promise<void> {
    const next = structuredClone(override === undefined ? latest.current[section] : override);
    setSaving(count => count + 1); setSaved("");
    queue.current = queue.current.then(async () => {
      const answer = await send("/api/settings", { method: "PUT", body: JSON.stringify({ section, value: next }) });
      setSaving(count => count - 1);
      setErrors(previous => ({ ...previous, [section]: answer.error ?? undefined }));
      if (!answer.error) { setSaved(`Saved ${section}`); window.dispatchEvent(new Event("settings:changed")); router.refresh(); }
    }).catch(error => { setSaving(count => Math.max(0, count - 1)); setErrors(previous => ({ ...previous, [section]: String(error) })); });
    return queue.current;
  }
  return { value, change, save, reload, errors, saving, saved };
}
