import { describe, expect, it } from "bun:test";
import { isTimePeriod, TIME_PERIODS } from "./types";
import {
  ENCOURAGEMENT_MESSAGES,
  formatTimestamp,
  getTimePeriod,
  getWelcomeTimeSnapshot,
  mergeRecentWorkspaces,
  PERIOD_GREETINGS,
  workspaceName,
} from "./utils";

describe("dayjs time formatting & welcome encouragement utilities", () => {
  it("validates TIME_PERIODS SSOT and isTimePeriod type guard with valid and boundary values", () => {
    expect(TIME_PERIODS).toEqual(["morning", "afternoon", "evening", "late_night"]);

    for (const period of TIME_PERIODS) {
      expect(isTimePeriod(period)).toBe(true);
      expect(PERIOD_GREETINGS[period].length).toBeGreaterThan(0);
    }

    expect(isTimePeriod("")).toBe(false);
    expect(isTimePeriod("noon")).toBe(false);
    expect(isTimePeriod(null)).toBe(false);
    expect(isTimePeriod(undefined)).toBe(false);
    expect(isTimePeriod(2026)).toBe(false);
  });

  it("classifies time periods across hour boundaries accurately", () => {
    // Boundary assertions for morning [05:00, 11:59]
    expect(getTimePeriod("2026-11-04T04:59:59")).toBe("late_night");
    expect(getTimePeriod("2026-11-04T05:00:00")).toBe("morning");
    expect(getTimePeriod("2026-11-04T11:59:59")).toBe("morning");

    // Boundary assertions for afternoon [12:00, 17:59]
    expect(getTimePeriod("2026-11-04T12:00:00")).toBe("afternoon");
    expect(getTimePeriod("2026-11-04T15:34:08")).toBe("afternoon");
    expect(getTimePeriod("2026-11-04T17:59:59")).toBe("afternoon");

    // Boundary assertions for evening [18:00, 22:59]
    expect(getTimePeriod("2026-11-04T18:00:00")).toBe("evening");
    expect(getTimePeriod("2026-11-04T22:59:59")).toBe("evening");

    // Boundary assertions for late_night [23:00, 04:59]
    expect(getTimePeriod("2026-11-04T23:00:00")).toBe("late_night");
    expect(getTimePeriod("2026-11-04T00:00:00")).toBe("late_night");
  });

  it("builds complete non-empty WelcomeTimeSnapshot via dayjs", () => {
    const snapshot = getWelcomeTimeSnapshot("2026-11-04T15:34:08", 0);

    expect(snapshot).toEqual({
      period: "afternoon",
      greeting: "下午好",
      formattedTime: "15:34:08",
      formattedDate: "2026年11月04日 星期三",
      encouragement: ENCOURAGEMENT_MESSAGES[0],
    });

    // Boundary index wrapping (negative & overflow indices)
    const wrappedSnapshot = getWelcomeTimeSnapshot(
      "2026-11-04T08:05:09",
      ENCOURAGEMENT_MESSAGES.length + 2,
    );
    expect(wrappedSnapshot.period).toBe("morning");
    expect(wrappedSnapshot.greeting).toBe("早上好");
    expect(wrappedSnapshot.formattedTime).toBe("08:05:09");
    expect(wrappedSnapshot.encouragement).toBe(ENCOURAGEMENT_MESSAGES[2]);
  });

  it("formats session timestamps with dayjs", () => {
    const ts = new Date("2026-11-04T15:34:08").getTime();
    expect(formatTimestamp(ts)).toBe("11/04 15:34");
  });

  it("merges picked workspace with discovered and existing recent workspaces without duplicates", () => {
    const merged = mergeRecentWorkspaces(
      "/Users/allure/Desktop/new-folder",
      ["/Users/allure/Desktop/coderelay", "/Users/allure/Desktop/new-folder"],
      ["/Users/allure/Desktop/archive-repo", "   ", "/Users/allure/Desktop/coderelay"],
      3,
    );

    expect(merged).toEqual([
      "/Users/allure/Desktop/new-folder",
      "/Users/allure/Desktop/coderelay",
      "/Users/allure/Desktop/archive-repo",
    ]);
    expect(workspaceName("/Users/allure/Desktop/new-folder/")).toBe("new-folder");
    expect(workspaceName("C:\\Projects\\coderelay\\")).toBe("coderelay");
    expect(workspaceName("   ")).toBe("—");
  });
});
