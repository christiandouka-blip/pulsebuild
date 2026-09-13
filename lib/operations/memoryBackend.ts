import type { IssueRecoveryHistoryEvent } from "@/domain/recovery/history";
import type {
  OperationalBundle,
  PersistedCommand,
  PersistedObservation,
} from "@/domain/operations/types";
import { emptyOperationalBundle } from "@/lib/operations/reconstruct";
import type {
  OperationalStore,
  OperationalTransaction,
  OperationalWrites,
} from "@/lib/operations/ports";
import { replayBaselineFromSnapshot } from "@/lib/operations/replaySnapshot";
import type { ProjectSnapshot } from "@/domain/types/snapshot";

type ProjectKey = string;

function keyOf(organizationId: string, projectId: string): ProjectKey {
  return `${organizationId}|${projectId}`;
}

type StoredProject = {
  bundle: OperationalBundle;
};

export class MemoryOperationalStore implements OperationalStore {
  private readonly projects = new Map<ProjectKey, StoredProject>();
  private readonly chains = new Map<ProjectKey, Promise<unknown>>();
  private failNext = false;

  constructor(private readonly replayBaselineAt?: string) {}

  failNextTransaction(): void {
    this.failNext = true;
  }

  seedReplayBaseline(snapshot: ProjectSnapshot, organizationId: string): void {
    const key = keyOf(organizationId, snapshot.project.id);
    if (this.projects.has(key)) return;
    this.projects.set(key, {
      bundle: emptyOperationalBundle({
        organizationId,
        projectId: snapshot.project.id,
        replayBaselineAt:
          this.replayBaselineAt ?? replayBaselineFromSnapshot(snapshot),
      }),
    });
  }

  async transact<T>(
    scope: { organizationId: string; projectId: string },
    run: (tx: OperationalTransaction) => Promise<T>,
  ): Promise<T> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("operational store unavailable");
    }
    const key = keyOf(scope.organizationId, scope.projectId);
    const previous = this.chains.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.chains.set(
      key,
      previous.catch(() => undefined).then(() => gate),
    );
    await previous.catch(() => undefined);

    try {
      const stored = this.projects.get(key);
      const bundle = stored
        ? cloneBundle(stored.bundle)
        : emptyOperationalBundle({
            organizationId: scope.organizationId,
            projectId: scope.projectId,
            replayBaselineAt: this.replayBaselineAt ?? "1970-01-01T00:00:00.000Z",
          });

      const tx: OperationalTransaction = {
        loadBundle: async () => cloneBundle(this.projects.get(key)?.bundle ?? bundle),
        findCommandByIdempotencyKey: async (idempotencyKey) => {
          const latest = this.projects.get(key)?.bundle ?? bundle;
          return (
            latest.commands.find((item) => item.idempotencyKey === idempotencyKey) ??
            null
          );
        },
        commit: async (writes: OperationalWrites) => {
          if (
            writes.head.organizationId !== scope.organizationId ||
            writes.head.projectId !== scope.projectId
          ) {
            throw new Error("tenant scope mismatch");
          }
          const current = this.projects.get(key)?.bundle;
          const currentVersion = current?.workflowVersion ?? 0;
          if (writes.head.workflowVersion !== currentVersion + 1) {
            const error = new Error("workflow version conflict");
            error.name = "PersistenceConflict";
            throw error;
          }
          const next = applyWrites(current ?? bundle, writes);
          this.projects.set(key, { bundle: next });
        },
      };

      return await run(tx);
    } finally {
      release();
    }
  }

  inspect(scope: { organizationId: string; projectId: string }): OperationalBundle | null {
    const stored = this.projects.get(keyOf(scope.organizationId, scope.projectId));
    return stored ? cloneBundle(stored.bundle) : null;
  }

  writeCount(scope: { organizationId: string; projectId: string }): number {
    const stored = this.projects.get(keyOf(scope.organizationId, scope.projectId));
    return stored?.bundle.commands.length ?? 0;
  }
}

function applyWrites(
  current: OperationalBundle,
  writes: OperationalWrites,
): OperationalBundle {
  const observations: PersistedObservation[] = [...current.observations];
  if (writes.observation) observations.push(writes.observation);
  const commands: PersistedCommand[] = [...current.commands, writes.command];
  const recoveryEvents: IssueRecoveryHistoryEvent[] = [
    ...writes.recoveryEvents,
  ];
  return {
    organizationId: writes.head.organizationId,
    projectId: writes.head.projectId,
    workflowVersion: writes.head.workflowVersion,
    commandSeq: writes.head.commandSeq,
    replayBaselineAt: writes.head.replayBaselineAt,
    currentlyRecoveredIssueIds: [...writes.head.currentlyRecoveredIssueIds],
    observations,
    commands,
    recoveryEvents,
  };
}

function cloneBundle(bundle: OperationalBundle): OperationalBundle {
  return {
    ...bundle,
    currentlyRecoveredIssueIds: [...bundle.currentlyRecoveredIssueIds],
    observations: bundle.observations.map((item) => ({
      ...item,
      evidenceIds: [...item.evidenceIds],
      payload: { ...item.payload },
    })),
    commands: bundle.commands.map((item) => ({
      ...item,
      fsmCommands: item.fsmCommands.map((command) => ({ ...command })),
    })),
    recoveryEvents: bundle.recoveryEvents.map((item) => ({
      ...item,
      sourceEffectIds: [...item.sourceEffectIds],
      evidence: [...item.evidence],
    })),
  };
}
