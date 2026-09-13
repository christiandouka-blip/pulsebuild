/**
 * Application-owned simulated workflow clock. Independent of ProjectSnapshot.
 * Orchestration is the only writer; selectors may read.
 */

import { create } from "zustand";

import {
  commitWorkflowStep,
  currentSimulatedAt,
  initialSimulatedClock,
  peekNextSimulatedAt,
  resetSimulatedClock,
  type SimulatedClock,
} from "@/lib/orchestration/simulatedClock";

export type WorkflowTimeAuthority = "simulated" | "operational";

type SimulatedClockStoreState = {
  clock: SimulatedClock | null;
  timeAuthority: WorkflowTimeAuthority;
  initializeClock: (
    baselineSimulatedAt: string,
    timeAuthority?: WorkflowTimeAuthority,
  ) => void;
  resetClock: () => void;
  /** Peek the instant a successful action would use. Does not advance. */
  peekNext: () => string | null;
  /** Advance one committed step. Returns the new current instant. */
  commitStep: () => string;
  current: () => string | null;
};

export const useSimulatedClockStore = create<SimulatedClockStoreState>((set, get) => ({
  clock: null,
  timeAuthority: "simulated",

  initializeClock: (baselineSimulatedAt, timeAuthority = "simulated") => {
    set({
      clock: initialSimulatedClock(baselineSimulatedAt),
      timeAuthority,
    });
  },

  resetClock: () => {
    const clock = get().clock;
    if (!clock) return;
    set({ clock: resetSimulatedClock(clock) });
  },

  peekNext: () => {
    const clock = get().clock;
    if (!clock) return null;
    if (get().timeAuthority === "operational") {
      return currentSimulatedAt(clock);
    }
    return peekNextSimulatedAt(clock);
  },

  commitStep: () => {
    const clock = get().clock;
    if (!clock) {
      throw new Error("Simulated clock is not initialized.");
    }
    if (get().timeAuthority === "operational") {
      return currentSimulatedAt(clock);
    }
    const next = commitWorkflowStep(clock);
    set({ clock: next });
    return currentSimulatedAt(next);
  },

  current: () => {
    const clock = get().clock;
    return clock ? currentSimulatedAt(clock) : null;
  },
}));
