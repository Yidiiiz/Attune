// Owns: graph retrieval, filters, search and accessible navigation (PROJECT.md §10.2).
// Failure behavior: show read failures inline and incomplete-index warnings explicitly;
// empty data never mounts a simulation. Focus reloads are ordered and cancelled on unmount.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { graphWindow, NODE_KINDS } from "@/lib/knowledge/graph-window";
import type { Graph, NodeKind } from "@/lib/knowledge/graph";
import { linkerHref } from "./href.ts";
import GraphCanvas from "./GraphCanvas.tsx";
import styles from "./Graph.module.css";

export default function GraphView({ focus }: { focus: string | null }) {
  const router = useRouter();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kinds, setKinds] = useState<NodeKind[]>(NODE_KINDS);
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  useEffect(() => {
    let issued = 0;
    let live = true;
    const aborts = new Set<AbortController>();
    const read = async (): Promise<void> => {
      const ticket = ++issued;
      const controller = new AbortController(); aborts.add(controller);
      try {
        const response = await fetch("/api/knowledge/graph", { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error ?? "Graph could not be read");
        if (live && ticket === issued) { setGraph(data); setError(null); }
      } catch (err) {
        if (live && ticket === issued && !controller.signal.aborted) setError((err as Error).message);
      } finally { aborts.delete(controller); }
    };
    void read(); window.addEventListener("focus", read);
    return () => { live = false; aborts.forEach((controller) => controller.abort()); window.removeEventListener("focus", read); };
  }, []);
  const visible = useMemo(() => graph ? graphWindow(graph, kinds, focus, all) : null, [graph, kinds, focus, all]);
  const open = (id: string): void => router.push(linkerHref(id, null));
  return <section className={styles.view} aria-label="Graph" data-ui="graph-view">
    <header className={styles.header}><h1>Graph</h1>
      <input type="search" aria-label="Search graph" placeholder="Find a node…" value={query} onChange={(event) => setQuery(event.target.value)} />
    </header>
    <div className={styles.filters} aria-label="Node types">{NODE_KINDS.map((kind) => <label key={kind}>
      <input type="checkbox" checked={kinds.includes(kind)} onChange={(event) => setKinds(event.target.checked ? [...kinds, kind] : kinds.filter((one) => one !== kind))} /> {kind}
    </label>)}</div>
    {error ? <p role="alert">{error}</p> : null}
    {graph?.errors.length ? <p role="alert">Some links could not be read: {graph.errors.join(", ")}</p> : null}
    {!visible ? <p>Reading graph…</p> : graph?.nodes.length === 0 ? <p>Nothing here yet</p> : <>
      <p className={styles.count}>{visible.nodes.length} nodes · {visible.edges.length} edges
        {graph && graph.nodes.length > 400 ? <> · {all ? "All nodes" : "Two-hop neighborhood"} <button onClick={() => setAll(!all)}>{all ? "Show neighborhood" : "Show all"}</button></> : null}
      </p>
      {visible.nodes.length === 0 ? <p>No nodes of the selected types.</p> : <GraphCanvas graph={visible} query={query} onOpen={open} />}
      <details className={styles.list} open><summary>Node list</summary><ul>{visible.nodes.map((node) => <li key={node.id}>
        <button data-node={node.id} onClick={() => open(node.id)} style={{ opacity: `${node.title} ${node.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? 1 : 0.35 }}>{node.title} <small>({node.kind})</small></button>
      </li>)}</ul></details>
    </>}
  </section>;
}
