// Covers the six functions dates.ts has today, against the two 2026 daylight-saving transitions in
// America/New_York: March 8 (02:00 EST becomes 03:00 EDT) and November 1 (02:00 EDT becomes 01:00
// EST, so 01:30 happens twice). Every instant below is written in UTC and asserted in local terms,
// which is the only way to catch a function that formats the machine's zone instead of the user's.
//
// The ranking helpers (daysBetween, daysUntil) arrive with lib/schedule/rank.ts in Phase 3 and are
// tested there; building them early to test them here would be building Phase 3.

import { describe, expect, it } from "vitest";
import { datePart, nowIso, splitLocalIso, todayIn, zonedParts, zoneOffset } from "./dates.ts";

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
