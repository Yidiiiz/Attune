// Owns: the sheet's ordered Build stream, gate requests and per-device pending-session ID.
// Failure behavior: keep prompt/partial text, route configuration failures to one toast,
// and keep stale or interrupted diffs available for explicit review.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { reportFailure, send } from "@/components/tasks/writes";
import type { BuildEvent, BuildState } from "@/lib/agent/build";

const KEY = "build.pending";
export function useBuild() {
  const [state, setState] = useState<BuildState | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef<BuildState | null>(null);
  const active = useRef(false);
  const issued = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const receive = useCallback((next: BuildState) => {
    issued.current += 1; latest.current = next; setState(next);
    try { window.sessionStorage.setItem(KEY, next.id); } catch { /* storage is optional */ }
  }, []);
  const reload = useCallback(async () => {
    if (active.current || !latest.current?.id) return;
    const ticket = ++issued.current;
    const answer = await send(`/api/agent/build?id=${encodeURIComponent(latest.current.id)}`, { method: "GET" });
    if (ticket !== issued.current || active.current) return;
    if (answer.error) setError(answer.error); else receive(answer.data.state as unknown as BuildState);
  }, [receive]);
  useEffect(() => {
    try {
      const id = window.sessionStorage.getItem(KEY);
      if (id) { latest.current = { id, phase: "failed", plan: "", diff: "", paths: [] }; void reload(); }
    } catch { /* no saved session */ }
    window.addEventListener("focus", reload);
    return () => { abort.current?.abort(); window.removeEventListener("focus", reload); };
  }, [reload]);
  const failure = (message: string, code: string): void => {
    if (["auth", "provider"].includes(code)) { reportFailure("Build unavailable", message); setError(null); }
    else setError(message);
  };
  const stream = async (body: Record<string, unknown>): Promise<boolean> => {
    if (active.current) return false;
    active.current = true; setBusy(true); setError(null); setText(""); issued.current += 1;
    const controller = new AbortController(); abort.current = controller;
    let final: BuildState | null = null, failed = false;
    try {
      const response = await fetch("/api/agent/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok || !response.body) {
        const problem = await response.json(); failure(problem.error ?? response.statusText, problem.code ?? "invalid"); return false;
      }
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = "";
      const event = (raw: string): void => {
        if (!raw.trim()) return;
        const value = JSON.parse(raw) as BuildEvent;
        if (value.type === "state") { final = value.state; receive(value.state); }
        else if (value.type === "text") setText((current) => current + value.text);
        else { failed = true; failure(value.message, value.code); }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        lines.forEach(event);
      }
      buffer += decoder.decode(); if (buffer.trim()) event(buffer);
      return !failed && final !== null && ["plan", "diff", "committed"].includes((final as BuildState).phase);
    } catch (err) {
      setError(controller.signal.aborted ? "Build stopped. Refresh its status to review any partial edits." : (err as Error).message);
      return false;
    } finally { active.current = false; abort.current = null; setBusy(false); }
  };
  const gate = async (action: "apply" | "revert"): Promise<void> => {
    if (!latest.current || active.current) return;
    active.current = true; setBusy(true); setError(null); issued.current += 1;
    try {
      const answer = await send(`/api/agent/build/${action}`, { method: "POST", body: JSON.stringify({ id: latest.current.id }) });
      if (answer.error) failure(answer.error, String(answer.data.code ?? "invalid"));
      else receive(answer.data.state as unknown as BuildState);
    } finally { active.current = false; setBusy(false); }
  };
  return { state, text, error, busy, canStop: abort.current !== null, reload, stop: () => abort.current?.abort(),
    start: (prompt: string, approval: "plan" | "auto") => stream({ prompt, approval, conversationId: latest.current?.conversationId }),
    approve: () => latest.current ? stream({ id: latest.current.id, approved: true }) : Promise.resolve(false),
    commit: () => gate("apply"), revert: () => gate("revert") };
}
