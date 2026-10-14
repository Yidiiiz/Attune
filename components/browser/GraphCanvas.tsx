// Owns: d3's mutable simulation and device-pixel-ratio canvas (PROJECT.md §10.2).
// Failure behavior: a missing canvas context says so in place; cleanup stops the
// simulation and observers. Server graph data is never mutated by d3.
"use client";

import { useEffect, useRef, useState } from "react";
import { forceCenter, forceLink, forceManyBody, forceSimulation } from "d3-force";
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force";
import type { Graph, GraphNode } from "@/lib/knowledge/graph";
import styles from "./Graph.module.css";

type Node = GraphNode & SimulationNodeDatum;
type Edge = SimulationLinkDatum<Node>;
type Point = { node: Node; x: number; y: number; r: number };
const token = (kind: string): string => `--node-${kind === "conversation" ? "chat" : ["task", "note", "map", "collection"].includes(kind) ? kind : "file"}`;

export default function GraphCanvas({ graph, query, onOpen }: { graph: Graph; query: string; onOpen: (id: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const points = useRef<Point[]>([]);
  const hover = useRef<string | null>(null);
  const search = useRef(query);
  const redraw = useRef<() => void>(() => {});
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  search.current = query.toLocaleLowerCase();

  useEffect(() => { redraw.current(); }, [query]);
  useEffect(() => {
    const element = canvas.current;
    if (!element || graph.nodes.length === 0) return;
    const ctx = element.getContext("2d");
    if (!ctx) { setError("This browser cannot draw the graph. Use the node list below."); return; }
    const nodes: Node[] = graph.nodes.map((node) => ({ ...node }));
    const edges: Edge[] = graph.edges.map((edge) => ({ ...edge }));
    const neighbors = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      for (const [from, to] of [[edge.source, edge.target], [edge.target, edge.source]]) {
        const set = neighbors.get(from) ?? new Set<string>();
        set.add(to); neighbors.set(from, set);
      }
    }
    let width = 1, height = 1;
    const simulation = forceSimulation(nodes)
      .force("link", forceLink<Node, Edge>(edges).id((node) => node.id).distance(65))
      .force("charge", forceManyBody().strength(-110))
      .force("center", forceCenter(0, 0));
    const draw = (): void => {
      const palette = getComputedStyle(element);
      const ratio = window.devicePixelRatio || 1;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const xs = nodes.map((n) => n.x ?? 0), ys = nodes.map((n) => n.y ?? 0);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const scale = Math.min(1.5, Math.max(0.01, (width - 70) / Math.max(1, maxX - minX)),
        Math.max(0.01, (height - 70) / Math.max(1, maxY - minY)));
      const x = (n: Node): number => ((n.x ?? 0) - (minX + maxX) / 2) * scale + width / 2;
      const y = (n: Node): number => ((n.y ?? 0) - (minY + maxY) / 2) * scale + height / 2;
      const highlighted = (id: string): boolean => hover.current === null || hover.current === id || !!neighbors.get(hover.current)?.has(id);
      ctx.strokeStyle = palette.getPropertyValue("--border-strong");
      for (const edge of edges) {
        const a = edge.source as Node, b = edge.target as Node;
        ctx.globalAlpha = highlighted(a.id) && highlighted(b.id) ? 0.7 : 0.12;
        ctx.beginPath(); ctx.moveTo(x(a), y(a)); ctx.lineTo(x(b), y(b)); ctx.stroke();
      }
      points.current = nodes.map((node) => ({ node, x: x(node), y: y(node), r: 4 + 2 * Math.sqrt(node.degree) }));
      for (const point of points.current) {
        const matches = `${point.node.title} ${point.node.id}`.toLocaleLowerCase().includes(search.current);
        ctx.globalAlpha = matches && highlighted(point.node.id) ? 1 : 0.14;
        ctx.fillStyle = palette.getPropertyValue(token(point.node.kind));
        ctx.beginPath(); ctx.arc(point.x, point.y, point.r, 0, 2 * Math.PI); ctx.fill();
        if (hover.current === point.node.id) {
          ctx.fillStyle = palette.getPropertyValue("--fg"); ctx.font = "13px sans-serif";
          ctx.fillText(point.node.title, point.x + point.r + 4, point.y + 4);
        }
      }
      ctx.globalAlpha = 1;
    };
    const resize = (): void => {
      const rect = element.getBoundingClientRect();
      width = rect.width; height = rect.height;
      const ratio = window.devicePixelRatio || 1;
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
      draw();
    };
    redraw.current = draw;
    simulation.on("tick", draw);
    const observer = new ResizeObserver(resize); observer.observe(element);
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    window.addEventListener("resize", resize); resize();
    return () => { simulation.stop(); observer.disconnect(); theme.disconnect(); window.removeEventListener("resize", resize); redraw.current = () => {}; points.current = []; };
  }, [graph]);

  const hit = (event: React.MouseEvent<HTMLCanvasElement>): Point | undefined => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [...points.current].reverse().find((point) => Math.hypot(event.clientX - rect.left - point.x, event.clientY - rect.top - point.y) <= point.r + 4);
  };
  return <>
    {error ? <p role="alert">{error}</p> : null}
    <canvas ref={canvas} className={styles.canvas} aria-label="Knowledge graph; use the node list for keyboard navigation" role="img"
      title={label} onPointerMove={(event) => { const point = hit(event); hover.current = point?.node.id ?? null; setLabel(point?.node.title ?? ""); redraw.current(); }}
      onPointerLeave={() => { hover.current = null; setLabel(""); redraw.current(); }}
      onClick={(event) => { const point = hit(event); if (point) onOpen(point.node.id); }} />
  </>;
}
