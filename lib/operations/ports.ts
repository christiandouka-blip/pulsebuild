import type { ReconstructedOperationalState } from "@/domain/operations/types";
import type { IssueRecoveryHistoryEvent } from "@/domain/recovery/history";
import type {
  OperationalBundle,
  PersistedCommand,
  PersistedObservation,
} from "@/domain/operations/types";

export type OperationalWrites = {
  head: {
    organizationId: string;
    projectId: string;
    workflowVersion: number;
    commandSeq: number;
    replayBaselineAt: string;
    currentlyRecoveredIssueIds: readonly string[];
  };
  observation?: PersistedObservation;
  command: PersistedCommand;
  recoveryEvents: readonly IssueRecoveryHistoryEvent[];
  operational: ReconstructedOperationalState;
};

export type OperationalStore = {
  transact<T>(
    scope: { organizationId: string; projectId: string },
    run: (tx: OperationalTransaction) => Promise<T>,
  ): Promise<T>;
};

export type OperationalTransaction = {
  loadBundle(): Promise<OperationalBundle>;
  findCommandByIdempotencyKey(idempotencyKey: string): Promise<PersistedCommand | null>;
  commit(writes: OperationalWrites): Promise<void>;
};
