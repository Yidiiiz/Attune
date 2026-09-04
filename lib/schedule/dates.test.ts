// Covers the six functions dates.ts has today, against the two 2026 daylight-saving transitions in
// America/New_York: March 8 (02:00 EST becomes 03:00 EDT) and November 1 (02:00 EDT becomes 01:00
// EST, so 01:30 happens twice). Every instant below is written in UTC and asserted in local terms,
// which is the only way to catch a function that formats the machine's zone instead of the user's.
//
// The ranking helpers arrive with rank.ts in Phase 3, and their DST tests (amendment `g`) are at the
// bottom of this file: off-by-one a day each way across both transitions, which is the failure mode
// a local-time implementation has and a UTC-anchored one does not.

import { describe, expect, it } from "vitest";
import {
  addDays,
  advanceDate,
  datePart,
  daysBetween,
  daysUntil,
  minutesFromMidnight,
  nowIso,
  splitLocalIso,
  todayIn,
  zonedParts,
  zoneOffset,
} from "./dates.ts";

const NY = "America/New_York";
const at = (iso: string) => new Date(iso);

// 01:30 EST, before the spring-forward gap.
const SPRING_BEFORE = at("2026-03-08T06:30:00Z");
// 03:30 EDT, after it. 02:30 local never happens on this day.
const SPRING_AFTER = at("2026-03-08T07:30:00Z");
// 01:30 EDT and 01:30 EST — the same wall clock, an hour apart.
const FALL_FIRST = at("2026-11-01T05:30:00Z");
const FALL_SECOND = at("2026-11-01T06:30:00Z");

describe("zoneOffset", () => {
  it("is -05:00 before the March transition and -04:00 after it", () => {
    expect(zoneOffset(SPRING_BEFORE, NY)).toBe("-05:00");
    expect(zoneOffset(SPRING_AFTER, NY)).toBe("-04:00");
    expect(zoneOffset(at("2026-03-09T12:00:00Z"), NY)).toBe("-04:00");
  });

  it("is -04:00 before the November transition and -05:00 after it", () => {
    expect(zoneOffset(FALL_FIRST, NY)).toBe("-04:00");
    expect(zoneOffset(FALL_SECOND, NY)).toBe("-05:00");
    expect(zoneOffset(at("2026-11-02T12:00:00Z"), NY)).toBe("-05:00");
  });

  it("pads a whole-hour offset and keeps a half-hour one", () => {
    expect(zoneOffset(SPRING_BEFORE, "Europe/Paris")).toBe("+01:00");
    expect(zoneOffset(SPRING_BEFORE, "Asia/Kolkata")).toBe("+05:30");
    expect(zoneOffset(SPRING_BEFORE, "UTC")).toBe("+00:00");
  });

  it("falls back to UTC rather than throwing on a timezone it does not know", () => {
    expect(zoneOffset(SPRING_BEFORE, "Mars/Olympus_Mons")).toBe("+00:00");
  });
});

describe("todayIn", () => {
  it("gives the local date, not the UTC one, on each side of March 8", () => {
    // 23:59 EST on the 7th is already the 8th in UTC.
    expect(todayIn(NY, at("2026-03-08T04:59:00Z"))).toBe("2026-03-07");
    expect(todayIn(NY, SPRING_BEFORE)).toBe("2026-03-08");
    expect(todayIn(NY, SPRING_AFTER)).toBe("2026-03-08");
  });

  it("gives the local date on each side of November 1", () => {
    // 23:59 EDT on October 31 is November 1 in UTC.
    expect(todayIn(NY, at("2026-11-01T03:59:00Z"))).toBe("2026-10-31");
    expect(todayIn(NY, FALL_FIRST)).toBe("2026-11-01");
    expect(todayIn(NY, FALL_SECOND)).toBe("2026-11-01");
    expect(todayIn(NY, at("2026-11-02T12:00:00Z"))).toBe("2026-11-02");
  });
});

describe("nowIso", () => {
  it("carries the offset in force at that instant, not the day's first one", () => {
    expect(nowIso(NY, SPRING_BEFORE)).toBe("2026-03-08T01:30:00-05:00");
    expect(nowIso(NY, SPRING_AFTER)).toBe("2026-03-08T03:30:00-04:00");
  });

  // The repeated hour: identical wall clocks, and the offset is the only thing that tells them
  // apart. A timestamp written without it would be genuinely ambiguous for one hour a year.
  it("distinguishes the two 01:30s on November 1 by their offsets alone", () => {
    expect(nowIso(NY, FALL_FIRST)).toBe("2026-11-01T01:30:00-04:00");
    expect(nowIso(NY, FALL_SECOND)).toBe("2026-11-01T01:30:00-05:00");
  });

  it("writes midnight as 00 and appends milliseconds when asked", () => {
    const midnight = at("2026-11-01T04:00:00.007Z");
    expect(nowIso(NY, midnight)).toBe("2026-11-01T00:00:00-04:00");
    expect(nowIso(NY, midnight, { ms: true })).toBe("2026-11-01T00:00:00.007-04:00");
  });
});

describe("zonedParts", () => {
  it("zero-pads every field and uses a 24-hour clock", () => {
    expect(zonedParts(at("2026-11-01T04:00:00Z"), NY)).toEqual({
      year: "2026", month: "11", day: "01", hour: "00", minute: "00", second: "00",
    });
  });

  it("reads the same instant differently in two zones", () => {
    const parts = zonedParts(SPRING_AFTER, "UTC");
    expect(`${parts.hour}:${parts.minute}`).toBe("07:30");
    expect(zonedParts(SPRING_AFTER, NY).hour).toBe("03");
  });
});

describe("splitLocalIso", () => {
  it("slices the stored characters without doing timezone maths", () => {
    expect(splitLocalIso("2026-11-01T01:30:00-05:00")).toEqual({ date: "2026-11-01", time: "01:30" });
    expect(splitLocalIso("2026-03-08T03:30:00.123-04:00")).toEqual({ date: "2026-03-08", time: "03:30" });
  });

  it("degrades to a date and no time on something that is not a timestamp", () => {
    expect(splitLocalIso("2026-03-08")).toEqual({ date: "2026-03-08", time: "" });
  });
});

describe("datePart", () => {
  it("takes the date half of a due value whether or not it has a time", () => {
    expect(datePart("2026-03-08")).toBe("2026-03-08");
    expect(datePart("2026-03-08T14:00:00-05:00")).toBe("2026-03-08");
  });
});

// --- Amendment `g`: the ranking helpers across both 2026 transitions ---------------------------
//
// March 8 is a 23-hour day in New York and November 1 is a 25-hour one. A `daysBetween` built on
// local `Date` arithmetic is off by one in opposite directions on those two days — short day floors
// down, long day floors up — so each transition is checked from both sides and across itself.

describe("daysBetween", () => {
  it("counts one day across the 23-hour spring-forward day", () => {
    expect(daysBetween("2026-03-07", "2026-03-08")).toBe(1);
    expect(daysBetween("2026-03-08", "2026-03-09")).toBe(1);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("counts one day across the 25-hour fall-back day", () => {
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("is signed, and symmetric across each transition", () => {
    expect(daysBetween("2026-03-09", "2026-03-07")).toBe(-2);
    expect(daysBetween("2026-11-02", "2026-10-31")).toBe(-2);
    expect(daysBetween("2026-03-08", "2026-03-08")).toBe(0);
  });

  it("spans a whole transition without drifting", () => {
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-10-15", "2026-11-15")).toBe(31);
    // Both transitions inside one span: a drifting implementation nets out to zero here and would
    // pass, so the two one-sided spans above are the ones that actually catch it.
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("reads only the date half of a value that carries a time", () => {
    expect(daysBetween("2026-03-07T23:30", "2026-03-08T00:30")).toBe(1);
    expect(daysBetween("2026-11-01T01:30", "2026-11-01T23:30")).toBe(0);
  });

  it("throws on a value that is not a date rather than returning NaN", () => {
    expect(() => daysBetween("tomorrow", "2026-03-08")).toThrow(/not a YYYY-MM-DD date/);
  });
});

describe("daysUntil", () => {
  it("is positive for a future due date and negative for a past one", () => {
    expect(daysUntil("2026-03-08", "2026-03-09")).toBe(1);
    expect(daysUntil("2026-03-08", "2026-03-07")).toBe(-1);
    expect(daysUntil("2026-11-01", "2026-11-02")).toBe(1);
    expect(daysUntil("2026-11-01", "2026-10-31")).toBe(-1);
  });

  it("is 0 on the due date itself, on both transition days", () => {
    expect(daysUntil("2026-03-08", "2026-03-08")).toBe(0);
    expect(daysUntil("2026-11-01", "2026-11-01")).toBe(0);
  });

  it("is null for a task with no deadline", () => {
    expect(daysUntil("2026-03-08", null)).toBeNull();
  });
});

describe("minutesFromMidnight", () => {
  it("reads the local clock, not the machine's", () => {
    expect(minutesFromMidnight(SPRING_BEFORE, NY)).toBe(90); // 01:30
    expect(minutesFromMidnight(SPRING_AFTER, NY)).toBe(210); // 03:30, the gap skipped
    expect(minutesFromMidnight(SPRING_BEFORE, "UTC")).toBe(390); // 06:30
  });

  it("gives the same minute for both 01:30s on November 1", () => {
    expect(minutesFromMidnight(FALL_FIRST, NY)).toBe(90);
    expect(minutesFromMidnight(FALL_SECOND, NY)).toBe(90);
  });
});

describe("advanceDate", () => {
  it("steps daily, weekly and biweekly across a transition without shifting the date", () => {
    expect(advanceDate("2026-03-07", "daily")).toBe("2026-03-08");
    expect(advanceDate("2026-03-08", "daily")).toBe("2026-03-09");
    expect(advanceDate("2026-03-07", "weekly")).toBe("2026-03-14");
    expect(advanceDate("2026-10-31", "weekly")).toBe("2026-11-07");
    expect(advanceDate("2026-10-25", "biweekly")).toBe("2026-11-08");
  });

  it("adds a calendar month and clamps to the last day", () => {
    expect(advanceDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceDate("2028-01-31", "monthly")).toBe("2028-02-29"); // leap year
    expect(advanceDate("2026-03-31", "monthly")).toBe("2026-04-30");
    expect(advanceDate("2026-01-15", "monthly")).toBe("2026-02-15");
    expect(advanceDate("2026-12-15", "monthly")).toBe("2027-01-15");
  });

  it("keeps a time on the value", () => {
    expect(advanceDate("2026-03-07T09:00", "daily")).toBe("2026-03-08T09:00");
    expect(advanceDate("2026-01-31T14:30", "monthly")).toBe("2026-02-28T14:30");
  });
});

describe("addDays", () => {
  it("moves a day at a time across both transitions", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08"); // into the 23-hour day
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // out of it
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // out of the 25-hour day
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap day
  });

  it("is the inverse of daysBetween, and drops any time on the value", () => {
    expect(addDays("2026-09-08", daysBetween("2026-09-08", "2026-10-30"))).toBe("2026-10-30");
    expect(addDays("2026-09-08T16:00", 1)).toBe("2026-09-09");
    expect(addDays("2026-09-08", 0)).toBe("2026-09-08");
  });
});
