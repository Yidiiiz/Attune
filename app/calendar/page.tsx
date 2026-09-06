// Owns: the Calendar tab (PROJECT.md §10.3). A route-level server file, so it reads the store
// directly under the §3 read exemption; everything it changes, it changes through an API route.
//
// The grid and the grouping happen here rather than on the client, through the same pure functions
// `GET /api/calendar` calls — so the page and the API cannot disagree about which cell a task is
// in, and the client is handed an answer rather than the rule for computing one.
//
// Failure behavior: an unreadable `?view=` or `?anchor=` falls back to Rolling and today rather
// than erroring. The URL is a navigation, and a page that refuses to render is a worse answer than
// the month you were probably asking for. `listTasks` names what it could not parse in `errors`,
// which the view shows as one line instead of swallowing it.

import { readSettings } from "@/lib/store/settings";
import { listTasks } from "@/lib/store/tasks";
import { gridFor, groupDays, isCalendarView } from "@/lib/schedule/calendar";
import { todayIn } from "@/lib/schedule/dates";
import CalendarView from "@/components/calendar/CalendarView";

export const dynamic = "force-dynamic";

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Search) {
  const params = await searchParams;
  const settings = await readSettings();
  const today = todayIn(settings.timezone);

  const view = isCalendarView(params.view) ? params.view : "rolling";
  const asked = params.anchor;
  const anchor = typeof asked === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today;

  const grid = gridFor(view, anchor, settings.firstDayOfWeek);
  const tasks = await listTasks();
  const errors = [...listTasks.errors];

  return (
    <CalendarView grid={grid} days={groupDays(tasks, grid.from, grid.to)} today={today} errors={errors} />
  );
}
