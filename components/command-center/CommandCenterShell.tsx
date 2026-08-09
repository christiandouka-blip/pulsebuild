"use client";

import { useEffect } from "react";

import { AgentChatPanelShell } from "@/components/chat/AgentChatPanelShell";
import { CommandTopBar } from "@/components/command-center/CommandTopBar";
import { DecisionReviewQueue } from "@/components/command-center/DecisionReviewQueue";
import { HealthStrip } from "@/components/command-center/HealthStrip";
import { LiveSignalFeedShell } from "@/components/command-center/LiveSignalFeedShell";
import { TimelinePanelShell } from "@/components/timeline/TimelinePanelShell";
import {
  formatSimulatedDateTime,
  getCurrentPhase,
  getProjectFactCounts,
} from "@/lib/selectors/projectSelectors";
import { countOpenTier1Issues } from "@/lib/selectors/reasoningSelectors";
import { useDecisionStore } from "@/store/useDecisionStore";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useUIStore } from "@/store/useUIStore";

/**
 * Command Center orchestration.
 * Coordinates reasoning process/reset with decision sync/reset without making
 * the reasoning store aware of the decision store.
 */
export function CommandCenterShell() {
  const activeMobilePanel = useUIStore((state) => state.activeMobilePanel);
  const showChatExpanded = activeMobilePanel === "chat";
  const snapshot = useProjectStore((state) => state.snapshot);
  const isLoaded = useProjectStore((state) => state.isLoaded);
  const loadSeedProject = useProjectStore((state) => state.loadSeedProject);

  const isInitialized = useReasoningStore((state) => state.isInitialized);
  const initializeReasoning = useReasoningStore((state) => state.initializeReasoning);
  const runtime = useReasoningStore((state) => state.runtime);
  const canProcessNext = useReasoningStore((state) => state.canProcessNext);
  const processNextObservation = useReasoningStore(
    (state) => state.processNextObservation,
  );
  const resetReasoning = useReasoningStore((state) => state.resetReasoning);

  const decisionRuntime = useDecisionStore((state) => state.runtime);
  const syncFromReasoning = useDecisionStore((state) => state.syncFromReasoning);
  const resetDecisions = useDecisionStore((state) => state.resetDecisions);

  useEffect(() => {
    if (!isLoaded) loadSeedProject();
  }, [isLoaded, loadSeedProject]);

  useEffect(() => {
    if (!isInitialized) initializeReasoning();
  }, [isInitialized, initializeReasoning]);

  const handleProcessNext = () => {
    processNextObservation();
    const committed = useReasoningStore.getState().runtime;
    syncFromReasoning(committed);
  };

  const handleReset = () => {
    resetReasoning();
    resetDecisions();
  };

  const projectName = snapshot?.project.name ?? "—";
  const phaseName = snapshot ? getCurrentPhase(snapshot)?.name ?? "—" : "—";
  const dateLabel = snapshot ? formatSimulatedDateTime(snapshot) : "—";
  const timezone = snapshot?.project.timezone ?? "—";
  const counts = snapshot ? getProjectFactCounts(snapshot) : null;

  const tier1Count = countOpenTier1Issues(runtime.reasonings);

  const healthStrip = (
    <HealthStrip
      health={runtime.health}
      drift={runtime.drift}
      tier1Count={tier1Count}
      unresolvedActions={0}
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
            priority, predicts impact, and generates recommendations. In Decision
            Review you can acknowledge, approve, or reject a recommendation, then
            confirm field execution and record manual verification. Workflow
            decisions are recorded as audit history only — they do not change
            project data or resolve the underlying operational issue, and
            operational recovery remains deferred.
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
