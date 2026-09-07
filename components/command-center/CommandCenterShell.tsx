"use client";

import { useEffect } from "react";

import { AgentChatPanelShell } from "@/components/chat/AgentChatPanelShell";
import { CommandTopBar } from "@/components/command-center/CommandTopBar";
import { DecisionReviewQueue } from "@/components/command-center/DecisionReviewQueue";
import { HealthStrip } from "@/components/command-center/HealthStrip";
import { LiveSignalFeedShell } from "@/components/command-center/LiveSignalFeedShell";
import { TimelinePanelShell } from "@/components/timeline/TimelinePanelShell";
import {
  formatSimulatedInstant,
  getCurrentPhase,
  getProjectFactCounts,
} from "@/lib/selectors/projectSelectors";
import {
  countEffectiveOpenTier1,
  presentationScores,
  recoverySummaryView,
} from "@/lib/selectors/recoveryPresentationSelectors";
import {
  ensureCommandCenterInitialized,
  processNextObservationCommitted,
  resetCommandCenter,
} from "@/lib/orchestration/commandCenter";
import { currentSimulatedAt } from "@/lib/orchestration/simulatedClock";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useRecoveryStore } from "@/store/useRecoveryStore";
import { useSimulatedClockStore } from "@/store/useSimulatedClockStore";
import { useUIStore } from "@/store/useUIStore";

/**
 * Command Center orchestration.
 * Coordinates reasoning, decisions, overlay, recovery, and the workflow clock
 * through the application orchestration layer — stores do not import each other
 * circularly.
 */
export function CommandCenterShell() {
  const activeMobilePanel = useUIStore((state) => state.activeMobilePanel);
  const showChatExpanded = activeMobilePanel === "chat";
  const snapshot = useProjectStore((state) => state.snapshot);
  const isLoaded = useProjectStore((state) => state.isLoaded);
  const loadSeedProject = useProjectStore((state) => state.loadSeedProject);

  const isInitialized = useReasoningStore((state) => state.isInitialized);
  const runtime = useReasoningStore((state) => state.runtime);
  const canProcessNext = useReasoningStore((state) => state.canProcessNext);

  const decisionRuntime = useDecisionStore((state) => state.runtime);
  const overlayRuntime = useOverlayStore((state) => state.runtime);
  const recoveryRuntime = useRecoveryStore((state) => state.runtime);
  const clock = useSimulatedClockStore((state) => state.clock);

  useEffect(() => {
    if (!isLoaded) loadSeedProject();
  }, [isLoaded, loadSeedProject]);

  useEffect(() => {
    if (isLoaded) ensureCommandCenterInitialized();
  }, [isLoaded, isInitialized]);

  const handleProcessNext = () => {
    processNextObservationCommitted();
  };

  const handleReset = () => {
    resetCommandCenter();
  };

  const projectName = snapshot?.project.name ?? "—";
  const phaseName = snapshot ? getCurrentPhase(snapshot)?.name ?? "—" : "—";
  const timezone = snapshot?.project.timezone ?? "—";
  const clockIso = clock ? currentSimulatedAt(clock) : snapshot?.project.currentSimulatedAt;
  const dateLabel =
    clockIso && timezone !== "—" ? formatSimulatedInstant(clockIso, timezone) : "—";
  const counts = snapshot ? getProjectFactCounts(snapshot) : null;

  const { health, drift } = presentationScores(runtime, recoveryRuntime);
  const recovery = recoverySummaryView(runtime, recoveryRuntime);
  const tier1Count = countEffectiveOpenTier1(runtime, recoveryRuntime);

  const healthStrip = (
    <HealthStrip
      health={health}
      drift={drift}
      tier1Count={tier1Count}
      recovery={recovery}
    />
  );
  const signalFeed = <LiveSignalFeedShell reasonings={runtime.reasonings} />;
  const decisionReview = (
    <DecisionReviewQueue
      reasonings={runtime.reasonings}
      decisionRuntime={decisionRuntime}
    />
  );
  const timeline = (
    <TimelinePanelShell
      events={runtime.timeline}
      decisions={decisionRuntime.decisions}
      overlay={overlayRuntime}
      recovery={recoveryRuntime}
    />
  );

  return (
    <div className="flex min-h-screen flex-col">
      <CommandTopBar
        projectName={projectName}
        phase={phaseName}
        dateLabel={dateLabel}
        timezone={timezone}
        canProcessNext={canProcessNext}
        onProcessNext={handleProcessNext}
        onReset={handleReset}
      />

      <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
        <div className="rounded-md border border-surface-border bg-surface-elevated/50 px-4 py-3 text-sm text-muted-text">
          <p>
            Deterministic reasoning is active. Use “Process Next Observation” to
            detect the next approved operational event; PulseBuild classifies
            priority, predicts impact, and generates recommendations. Decision
            Review records superintendent workflow. Overlay and recovery apply only
            from structured effects and proven operational facts. Health and Drift
            shown here are effective operational scores — a recovered blocker is
            not the same as a recovered project.
          </p>
          {counts ? (
            <p className="mt-2 text-xs text-muted-text">
              {counts.taskCount} tasks · {counts.crewCount} crews ·{" "}
              {counts.equipmentCount} equipment · {counts.inspectionCount}{" "}
              inspections · {counts.permitCount} permits ·{" "}
              {counts.criticalPathTaskCount} critical-path tasks
            </p>
          ) : null}
        </div>

        <div className="space-y-4 md:hidden">
          {!showChatExpanded ? (
            <>
              {healthStrip}
              {signalFeed}
              {decisionReview}
              {timeline}
            </>
          ) : (
            <AgentChatPanelShell forceExpanded />
          )}
        </div>

        <div className="hidden space-y-4 md:block lg:hidden">
          {healthStrip}
          {signalFeed}
          {decisionReview}
          <AgentChatPanelShell />
          {timeline}
        </div>

        <div className="hidden space-y-4 lg:block">
          {healthStrip}
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-7">{signalFeed}</div>
            <div className="xl:col-span-5">{decisionReview}</div>
          </div>
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-7">{timeline}</div>
            <div className="xl:col-span-5">
              <AgentChatPanelShell />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
