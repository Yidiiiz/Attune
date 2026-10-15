// Owns: immediate accessible route-loading feedback while file-backed pages render.
// Failure behavior: the loading shell makes no requests and gives way to the route result.
export default function Loading() {
  return <div className="route-loading" role="status" aria-label="Loading page"><div /><div /><div /><span>Loading…</span></div>;
}
