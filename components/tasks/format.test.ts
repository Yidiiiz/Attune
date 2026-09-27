// Covers the display strings of the Today tab. The cases that matter are the boundaries: the day a
// relative label changes word, the fortnight where it becomes a date, a body with no checkboxes at
// all, and a day end past midnight — each of which is a thing a reader would notice being wrong.

import { describe, expect, it } from "vitest";
import {
  PRIORITY_LABEL,
  clockLabel,
  describeDate,
  durationLabel,
  relativeDue,
  showsPriority,
  subtaskProgress,
} from "./format.ts";

describe("describeDate", () => {
  it("names the weekday and the day", () => {
    expect(describeDate("2026-09-08", "2026-09-08")).toEqual({
      weekday: "Tuesday",
      long: "September 8",
    });
  });

  it("adds the year only when it is not the current one", () => {
    expect(describeDate("2027-01-04", "2026-09-08").long).toBe("January 4, 2027");
    expect(describeDate("2026-01-04", "2026-09-08").long).toBe("January 4");
  });

  it("reads the date at noon UTC, so no zone can shift it a day", () => {
    // A local-Date implementation west of UTC renders this as Monday the 7th.
    expect(describeDate("2026-09-08", "2026-09-08").weekday).toBe("Tuesday");
    expect(describeDate("2026-11-01", "2026-11-01").weekday).toBe("Sunday");
  });

  it("hands back a malformed date rather than throwing", () => {
    expect(describeDate("not-a-date", "2026-09-08")).toEqual({ weekday: "", long: "not-a-date" });
  });
});

describe("relativeDue", () => {
  const view = "2026-09-08";

  it("uses words for the three days a word exists for", () => {
    expect(relativeDue(view, "2026-09-08")).toBe("today");
    expect(relativeDue(view, "2026-09-09")).toBe("tomorrow");
    expect(relativeDue(view, "2026-09-07")).toBe("yesterday");
  });

  it("counts days in both directions", () => {
    expect(relativeDue(view, "2026-09-11")).toBe("in 3 days");
    expect(relativeDue(view, "2026-09-03")).toBe("5 days ago");
  });

  it("becomes a date once the count stops being picturable", () => {
    expect(relativeDue(view, "2026-09-21")).toBe("in 13 days"); // 13 days is still a count
    expect(relativeDue(view, "2026-09-22")).toBe("Sep 22"); // 14 is not
    expect(relativeDue(view, "2026-08-25")).toBe("Aug 25");
  });

  it("reads only the date half of a date-time", () => {
    expect(relativeDue(view, "2026-09-09T16:00")).toBe("tomorrow");
  });

  it("is null for a task with no deadline", () => {
    expect(relativeDue(view, null)).toBeNull();
  });

  it("crosses a daylight-saving transition without an off-by-one", () => {
    expect(relativeDue("2026-03-07", "2026-03-08")).toBe("tomorrow");
    expect(relativeDue("2026-11-01", "2026-11-02")).toBe("tomorrow");
    expect(relativeDue("2026-10-31", "2026-11-02")).toBe("in 2 days");
  });
});

describe("durationLabel", () => {
  it("writes minutes, hours, and both", () => {
    expect(durationLabel(45)).toBe("45m");
    expect(durationLabel(60)).toBe("1h");
    expect(durationLabel(90)).toBe("1h 30m");
    expect(durationLabel(120)).toBe("2h");
    expect(durationLabel(185)).toBe("3h 5m");
  });

  it("shows nothing for a task with no estimate", () => {
    expect(durationLabel(null)).toBeNull();
    expect(durationLabel(0)).toBeNull();
    expect(durationLabel(-30)).toBeNull();
  });
});

describe("subtaskProgress", () => {
  it("counts ticked and total", () => {
    expect(subtaskProgress("- [ ] a\n- [x] b\n- [ ] c\n")).toEqual({ done: 1, total: 3 });
    expect(subtaskProgress("- [X] a\n- [x] b\n")).toEqual({ done: 2, total: 2 });
  });

  it("counts nested boxes and accepts either bullet", () => {
    expect(subtaskProgress("- [ ] a\n  - [x] a1\n* [ ] b\n")).toEqual({ done: 1, total: 3 });
  });

  it("is null when the body has no checkboxes", () => {
    expect(subtaskProgress("")).toBeNull();
    expect(subtaskProgress("Chapters 4.1–4.3. Office hours Thursday.\n")).toBeNull();
    expect(subtaskProgress("- a plain bullet\n")).toBeNull();
  });
});

describe("priority", () => {
  it("marks every priority but the default one", () => {
    expect(showsPriority(1)).toBe(true);
    expect(showsPriority(2)).toBe(true);
    expect(showsPriority(3)).toBe(false);
    expect(showsPriority(4)).toBe(true);
  });

  it("has a word for all four", () => {
    expect(Object.keys(PRIORITY_LABEL)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("clockLabel", () => {
  it("writes a 24-hour clock, zero-padded", () => {
    expect(clockLabel(0)).toBe("00:00");
    expect(clockLabel(600)).toBe("10:00");
    expect(clockLabel(870)).toBe("14:30");
    expect(clockLabel(1439)).toBe("23:59");
  });

  it("wraps a day that ends past midnight (§4.9's 1560)", () => {
    expect(clockLabel(1440)).toBe("00:00");
    expect(clockLabel(1560)).toBe("02:00");
  });
});
