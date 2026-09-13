import { isValidIanaTimeZone } from "@/domain/validation/validateProjectSnapshot";

export type DateNormalizationResult =
  | { ok: true; value: string; kind: "date" | "instant" }
  | { ok: false; reason: "empty" | "invalid" | "ambiguous" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Normalize spreadsheet dates. Ambiguous slash dates are rejected.
 * Date-only values stay YYYY-MM-DD. Wall times without offset use project TZ.
 * Does not read the system clock.
 */
export function normalizeImportDate(
  raw: unknown,
  timeZone: string,
): DateNormalizationResult {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, reason: "empty" };
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return excelSerialToValue(raw, timeZone);
  }

  if (typeof raw !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return excelSerialToValue(Number(trimmed), timeZone);
  }

  if (/[\/]/.test(trimmed) || /^[0-9]{1,2}-[0-9]{1,2}-[0-9]{2,4}$/.test(trimmed)) {
    return { ok: false, reason: "ambiguous" };
  }

  const dateOnly = ISO_DATE.exec(trimmed);
  if (dateOnly) {
    if (!isValidYmd(+dateOnly[1], +dateOnly[2], +dateOnly[3])) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, value: trimmed, kind: "date" };
  }

  const instant = ISO_INSTANT.exec(trimmed);
  if (!instant) {
    return { ok: false, reason: "invalid" };
  }

  const year = +instant[1];
  const month = +instant[2];
  const day = +instant[3];
  const hour = +instant[4];
  const minute = +instant[5];
  const second = instant[6] ? +instant[6] : 0;
  const offset = instant[7];

  if (!isValidYmd(year, month, day) || hour > 23 || minute > 59 || second > 59) {
    return { ok: false, reason: "invalid" };
  }

  if (!offset) {
    if (!isValidIanaTimeZone(timeZone)) {
      return { ok: false, reason: "invalid" };
    }
    const iso = wallTimeToIso(timeZone, year, month, day, hour, minute, second);
    if (!iso) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, value: iso, kind: "instant" };
  }

  const parsed = Date.parse(trimmed.replace(" ", "T"));
  if (Number.isNaN(parsed)) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, value: new Date(parsed).toISOString(), kind: "instant" };
}

function excelSerialToValue(
  serial: number,
  timeZone: string,
): DateNormalizationResult {
  if (serial < 1 || serial > 60000) {
    return { ok: false, reason: "invalid" };
  }
  const utc = excelSerialToUtcDate(serial);
  const hasTime = Math.abs(serial % 1) > 1e-8;
  if (!hasTime) {
    const year = utc.getUTCFullYear();
    const month = utc.getUTCMonth() + 1;
    const day = utc.getUTCDate();
    return {
      ok: true,
      value: `${year}-${pad(month)}-${pad(day)}`,
      kind: "date",
    };
  }
  if (!isValidIanaTimeZone(timeZone)) {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok: true,
    value: utc.toISOString(),
    kind: "instant",
  };
}

/** Excel serial date: day 25569 is 1970-01-01 UTC. */
export function excelSerialToUtcDate(serial: number): Date {
  const utcDays = serial - 25569;
  return new Date(Math.round(utcDays * 86400 * 1000));
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function wallTimeToIso(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string | null {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = tzOffsetMs(timeZone, new Date(guess));
  if (offsetMs === null) return null;
  const instant = new Date(guess - offsetMs);
  const offsetMs2 = tzOffsetMs(timeZone, instant);
  if (offsetMs2 === null) return null;
  const corrected = new Date(guess - offsetMs2);
  const parts = zonedParts(timeZone, corrected);
  if (!parts) return null;
  if (
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour !== hour ||
    parts.minute !== minute ||
    parts.second !== second
  ) {
    return null;
  }
  return corrected.toISOString();
}

function tzOffsetMs(timeZone: string, instant: Date): number | null {
  const parts = zonedParts(timeZone, instant);
  if (!parts) return null;
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

function zonedParts(
  timeZone: string,
  instant: Date,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const bag: Record<string, string> = {};
    for (const part of fmt.formatToParts(instant)) {
      if (part.type !== "literal") bag[part.type] = part.value;
    }
    let hour = Number(bag.hour);
    if (hour === 24) hour = 0;
    return {
      year: Number(bag.year),
      month: Number(bag.month),
      day: Number(bag.day),
      hour,
      minute: Number(bag.minute),
      second: Number(bag.second),
    };
  } catch {
    return null;
  }
}
