// Owns: effective local cutoff for date-only deadlines, shared by ranking and labels.
export function deadlineTime(due: string, defaultTime = "23:59"): string {
  return due.includes("T") ? due.slice(11, 16) : defaultTime === "00:00" ? "23:59" : defaultTime;
}

export function deadlineKey(due: string, defaultTime = "23:59"): string {
  return `${due.slice(0, 10)}T${deadlineTime(due, defaultTime)}`;
}
