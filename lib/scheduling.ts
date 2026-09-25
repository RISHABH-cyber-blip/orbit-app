import { ScheduleBlock } from "./types";

export function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

/**
 * Finds the first free slot of `durationMinutes` given a list of already-busy blocks
 * (timetable classes + other tasks that day), bounded by wake/sleep time.
 */
export function findFreeSlot(
  busyBlocks: ScheduleBlock[],
  durationMinutes: number,
  wakeTime = "07:00",
  sleepTime = "23:00"
): { start: string; end: string } | null {
  const dayStart = timeToMinutes(wakeTime)!;
  const dayEnd = timeToMinutes(sleepTime)!;

  const busy = busyBlocks
    .filter((b) => b.start_time && b.end_time)
    .map((b) => ({ start: timeToMinutes(b.start_time)!, end: timeToMinutes(b.end_time)! }))
    .sort((a, b) => a.start - b.start);

  let cursor = dayStart;
  for (const block of busy) {
    if (block.start - cursor >= durationMinutes) {
      return { start: minutesToTime(cursor), end: minutesToTime(cursor + durationMinutes) };
    }
    if (block.end > cursor) cursor = block.end;
  }
  if (dayEnd - cursor >= durationMinutes) {
    return { start: minutesToTime(cursor), end: minutesToTime(cursor + durationMinutes) };
  }
  return null;
}

/**
 * Tries a normal free slot first. If the day is fully packed, it pushes sleep
 * time later (in 15-min steps, up to 2 hours) to make room, rather than
 * failing outright. Returns a `note` when it had to compromise, so the UI
 * can tell the user what it did.
 */
export function findSlotSmart(
  busyBlocks: ScheduleBlock[],
  durationMinutes: number,
  wakeTime = "07:00",
  sleepTime = "23:00"
): { start: string; end: string; note?: string } | null {
  const direct = findFreeSlot(busyBlocks, durationMinutes, wakeTime, sleepTime);
  if (direct) return direct;

  // Try trimming sleep time later, 15 minutes at a time, up to 2 hours.
  const originalSleepMin = timeToMinutes(sleepTime)!;
  for (let trim = 15; trim <= 120; trim += 15) {
    const pushedSleep = minutesToTime(originalSleepMin + trim);
    const slot = findFreeSlot(busyBlocks, durationMinutes, wakeTime, pushedSleep);
    if (slot) {
      return { ...slot, note: `Squeezed in by trimming ${trim} min of sleep — day was fully booked.` };
    }
  }

  // Last resort: stack it right after the latest busy block ends, even if
  // that runs past sleep time. Better than silently not scheduling at all.
  const busy = busyBlocks
    .filter((b) => b.start_time && b.end_time)
    .map((b) => timeToMinutes(b.end_time)!)
    .sort((a, b) => b - a);
  const latestEnd = busy[0] ?? timeToMinutes(wakeTime)!;
  return {
    start: minutesToTime(latestEnd),
    end: minutesToTime(latestEnd + durationMinutes),
    note: "Day was completely full — placed after your last scheduled item, past your usual sleep time.",
  };
}


export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeekFromDate(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

export function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
