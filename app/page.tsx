// Owns: Today (PROJECT.md §10.1). A route-level server file, so it reads the store directly rather
// than fetching its own data over HTTP from itself — the read exemption in §3. Everything it can
// change, it changes through an API route, like any component.
//
// The ranking happens here, on the server, and `now` is captured once and passed on. That is what
// makes "rendering twice yields identical order" true across the server/client boundary as well as
// within it: the client is never given a different clock to rank against.
//
// Failure behavior: `readSettings` repairs rather than throws, and `listTasks` skips a file it
// cannot parse and names it in `errors`, which the view shows as one line. An unreadable `?date=`
// falls back to today rather than erroring — the URL is a navigation, and a page that refuses to
// render is a worse answer than the day you were probably asking for.

import { readSettings } from "@/lib/store/settings";
import { listTasks } from "@/lib/store/tasks";
import { rankDay } from "@/lib/schedule/rank";
import { fixedStart } from "@/lib/schedule/timeline";
import { todayIn } from "@/lib/schedule/dates";
import TodayView from "@/components/today/TodayView";
import ComposerButton from "@/components/composer/ComposerButton";

export const dynamic = "force-dynamic";

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Search) {
  const asked = (await searchParams).date;
  const settings = await readSettings();
  const today = todayIn(settings.timezone);
  const date = typeof asked === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today;

  const now = new Date();
  const tasks = await listTasks();
  const errors = [...listTasks.errors];
  const ranked = rankDay(tasks, date, settings, now);

  // The timeline's pinned set: open tasks carrying a clock time on this day (§10.1). Chosen here so
  // the client is handed a list rather than the rule for building one.
  const fixed = tasks.filter(
    (task) => (task.status === "todo" || task.status === "doing") && fixedStart(task, date) !== null,
  );

  // The composer button is mounted by the two pages that have one and by neither the layout nor
  // the Chat page (§9.1, §15). Where it is rendered is the whole enforcement.
  return (
    <>
      <TodayView
        date={date}
        today={today}
        settings={settings}
        ranked={ranked}
        fixed={fixed}
        errors={errors}
        nowMs={now.getTime()}
      />
      <ComposerButton categories={settings.categories} viewDate={date} />
    </>
  );
}
