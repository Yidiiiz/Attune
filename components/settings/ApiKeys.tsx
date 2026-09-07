// Owns: the API keys section of Settings (PROJECT.md §11.1, §11.5) — the one screen in this app
// where a secret is typed. Phase 5 builds it ahead of the rest of Settings (Phase 10) for the
// reason §17 gives: without it there is no way to run the composer at all.
//
// The rule it exists to honour is that a key goes in and never comes out. The field is a password
// input, it is cleared the moment the write succeeds, and what the server answers with is the mask
// — `••••` and the last four — which is what the row shows from then on. Nothing here holds a key
// in state longer than the request, and nothing renders one.
//
// Failure behavior: every message lands inline next to the field that caused it, which is §13.5's
// rule read the same way as everywhere else — the remedy is right here, on this screen, in this
// box. A key error raised anywhere *else* in the app toasts precisely because its remedy is this
// screen; a key error raised on this screen has nowhere better to point.

"use client";

import { useCallback, useEffect, useState } from "react";
import { send } from "@/components/tasks/writes";
import styles from "./ApiKeys.module.css";

interface KeyRow {
  name: string;
  label: string;
  set: boolean;
  masked: string | null;
}

export default function ApiKeys() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const answer = await send("/api/settings/keys");
    setLoaded(true);
    if (answer.error !== null) {
      setError(answer.error);
      return;
    }
    setKeys(answer.data.keys as KeyRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(name: string): Promise<void> {
    const typed = value.trim();
    if (typed === "" || busy) return;
    setBusy(true);
    setError(null);

    const answer = await send("/api/settings/keys", {
      method: "PUT",
      body: JSON.stringify({ name, value: typed }),
    });
    setBusy(false);

    if (answer.error !== null) {
      // The typed value stays in the field: a refusal must not cost someone a pasted key.
      setError(answer.error);
      return;
    }
    setValue("");
    setEditing(null);
    await load();
  }

  async function remove(name: string): Promise<void> {
    if (busy) return;
    if (!window.confirm(`Remove ${name}? The assistant stops working until another is set.`)) return;
    setBusy(true);
    setError(null);

    const answer = await send(`/api/settings/keys?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    setBusy(false);
    if (answer.error !== null) {
      setError(answer.error);
      return;
    }
    await load();
  }

  return (
    <section className={styles.section} aria-labelledby="api-keys-heading">
      <h2 className={styles.heading} id="api-keys-heading">
        API keys
      </h2>
      <p className={styles.blurb}>
        Stored in <code>.env.local</code>, which is never committed. The history records that a key
        changed and its name — never its value.
      </p>

      {!loaded ? <p className={styles.blurb}>Reading…</p> : null}

      <ul className={styles.rows}>
        {keys.map((key) => (
          <li key={key.name} className={styles.row} data-key={key.name}>
            <div className={styles.top}>
              <span className={styles.label}>{key.label}</span>
              <code className={styles.mask}>{key.set ? key.masked : "not set"}</code>
              <span className={styles.spacer} />

              {editing === key.name ? (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setEditing(null);
                    setValue("");
                    setError(null);
                  }}
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setEditing(key.name);
                    setValue("");
                    setError(null);
                  }}
                >
                  {key.set ? "Change" : "Set"}
                </button>
              )}

              {key.set ? (
                <button
                  type="button"
                  className={styles.danger}
                  disabled={busy}
                  onClick={() => void remove(key.name)}
                >
                  Remove
                </button>
              ) : null}
            </div>

            {editing === key.name ? (
              <div className={styles.editor}>
                <input
                  type="password"
                  className={styles.input}
                  value={value}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={`${key.name}=…`}
                  aria-label={`${key.label} API key`}
                  disabled={busy}
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void save(key.name);
                    }
                  }}
                />
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy || value.trim() === ""}
                  onClick={() => void save(key.name)}
                >
                  Save
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {error === null ? null : (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
