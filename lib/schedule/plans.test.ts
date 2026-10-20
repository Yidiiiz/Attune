import { expect, test } from "vitest";
import { effectiveWeek, planTags, plannedWeek, weekStart } from "./plans.ts";

test("flexible Sunday weeks roll across DST, months and years without a write", () => {
  const plan = { tags: ["want", "plan-week:2026-10-18"] };
  expect(weekStart("2026-10-20")).toBe("2026-10-18");
  expect(effectiveWeek(plan, "2026-11-02")).toBe("2026-11-01");
  expect(effectiveWeek(plan, "2027-01-05")).toBe("2027-01-03");
  expect(plan.tags).toEqual(["want", "plan-week:2026-10-18"]);
  expect(effectiveWeek({ tags: ["plan-week:2027-01-10"] }, "2027-01-05")).toBe("2027-01-10");
});
test("changing intent and flexible week preserves unrelated tags and validates old targets", () => {
  expect(planTags(["school", "want", "plan-week:2026-10-18", "test"], false, null)).toEqual(["school", "test"]);
  expect(planTags(["school"], true, "2026-10-20")).toEqual(["school", "want", "plan-week:2026-10-18"]);
  expect(plannedWeek({ tags: ["plan-week:2026-02-30"] })).toBeNull();
  expect(effectiveWeek({ tags: ["school"] }, "2026-10-20")).toBeNull();
});
