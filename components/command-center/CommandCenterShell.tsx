"use client";

import { useEffect } from "react";

import { AgentChatPanelShell } from "@/components/chat/AgentChatPanelShell";
import { CommandTopBar } from "@/components/command-center/CommandTopBar";
import { HealthStrip } from "@/components/command-center/HealthStrip";
import { LiveSignalFeedShell } from "@/components/command-center/LiveSignalFeedShell";
import { RecommendationQueueShell } from "@/components/command-center/RecommendationQueueShell";
import { TimelinePanelShell } from "@/components/timeline/TimelinePanelShell";
import {
  formatSimulatedDateTime,
  getCurrentPhase,
  getProjectFactCounts,
} from "@/lib/selectors/projectSelectors";
import { countOpenTier1Issues } from "@/lib/selectors/reasoningSelectors";
import { useProjectStore } from "@/store/useProjectStore";
import { useReasoningStore } from "@/store/useReasoningStore";
import { useUIStore } from "@/store/useUIStore";

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
  const processNext = useReasoningStore((state) => state.processNextObservation);
  const resetReasoning = useReasoningStore((state) => state.resetReasoning);

  useEffect(() => {
    if (!isLoaded) loadSeedProject();
  }, [isLoaded, loadSeedProject]);

  useEffect(() => {
    if (!isInitialized) initializeReasoning();
  }, [isInitialized, initializeReasoning]);

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
  const recommendationQueue = (
    <RecommendationQueueShell reasonings={runtime.reasonings} />
  );
  const timeline = <TimelinePanelShell events={runtime.timeline} />;

  return (
    <div className="flex min-h-screen flex-col">
      <CommandTopBar
        projectName={projectName}
        phase={phaseName}
        dateLabel={dateLabel}
        timezone={timezone}
        canProcessNext={canProcessNext}
        onProcessNext={processNext}
        onReset={resetReasoning}
      />

      <div className="space-y-4 px-4 py-4 md:px-6 md:py-6">
        <div className="rounded-md border border-surface-border bg-surface-elevated/50 px-4 py-3 text-sm text-muted-text">
          <p>
            Deterministic reasoning is active. Use “Process Next Observation” to
            detect the next approved operational event; PulseBuild classifies
            priority, predicts impact, and generates recommendations from project
            data. Approval, execution, and verification activate in a later phase.
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

        {/* Mobile (<768px): operational priority stack */}
        <div className="space-y-4 md:hidden">
          {!showChatExpanded ? (
            <>
              {healthStrip}
              {signalFeed}
              {recommendationQueue}
              {timeline}
            </>
          ) : (
            <AgentChatPanelShell forceExpanded />
          )}
        </div>

        {/* Tablet (768–1023px): stacked panels */}
        <div className="hidden space-y-4 md:block lg:hidden">
          {healthStrip}
          {signalFeed}
          {recommendationQueue}
          <AgentChatPanelShell />
          {timeline}
        </div>

        {/* Desktop (≥1024px): grid layout */}
        <div className="hidden space-y-4 lg:block">
          {healthStrip}
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-7">{signalFeed}</div>
            <div className="xl:col-span-5">{recommendationQueue}</div>
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
