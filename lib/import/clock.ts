export type InstantClock = {
  nowIso(): string;
};

export function createFixedClock(iso: string): InstantClock {
  return { nowIso: () => iso };
}

/** Server operational clock for import audit timestamps. Not used by parsers. */
export function createServerClock(): InstantClock {
  return { nowIso: () => new Date().toISOString() };
}
