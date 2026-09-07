"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";

import { EmptyState } from "@/components/layout/EmptyState";
import { Panel } from "@/components/layout/Panel";
import { Button } from "@/components/layout/Button";
import { Badge } from "@/components/layout/Badge";
import type { AgentChatMessage, AgentTurnMessage } from "@/store/useAgentStore";
import { useAgentStore } from "@/store/useAgentStore";
import { useUIStore } from "@/store/useUIStore";
import { useVoiceStore } from "@/store/useVoiceStore";
import {
  askPulseBuildAgent,
  canSubmitAgentQuestion,
} from "@/lib/orchestration/agentChat";
import { replayLastEligibleAnnouncement } from "@/lib/orchestration/voiceAnnouncements";
import {
  AGENT_SUGGESTED_QUESTIONS,
  evidenceChipLabel,
  evidenceSignalHref,
  presentAgentResponse,
} from "@/lib/agent/agentChatPresentation";
import {
  formatVoiceOptionLabel,
  percentToVolume,
  presentVoiceControls,
  VOICE_PRESENTATION_OPTIONS,
  voiceStatusLabel,
} from "@/lib/voice/voiceControlPresentation";
import { cn } from "@/lib/cn";

type AgentChatPanelShellProps = {
  forceExpanded?: boolean;
};

export function AgentChatPanelShell({
  forceExpanded = false,
}: AgentChatPanelShellProps) {
  const isChatCollapsed = useUIStore((state) => state.isChatCollapsed);
  const toggleChatCollapsed = useUIStore((state) => state.toggleChatCollapsed);
  const messages = useAgentStore((state) => state.messages);
  const initializeVoices = useVoiceStore((state) => state.initializeVoices);
  const voiceStatus = useVoiceStore((state) =>
    voiceStatusLabel({
      speechAvailable: state.speechAvailable,
      speaking: state.speaking,
      enabled: state.preferences.enabled,
      muted: state.preferences.muted,
    }),
  );

  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const collapsed = forceExpanded ? false : isChatCollapsed;
  const canSend = canSubmitAgentQuestion(draft);

  useEffect(() => {
    initializeVoices();
  }, [initializeVoices]);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  const submitQuestion = (raw: string) => {
    const result = askPulseBuildAgent(raw);
    if (!result.ok) return;
    setDraft("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuestion(draft);
  };

  return (
    <Panel
      id="agent-chat"
      title="PulseBuild Agent"
      description="Explains current project facts. It does not change the project."
      action={
        !forceExpanded ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleChatCollapsed}
            aria-expanded={!collapsed}
            aria-controls="agent-chat-content"
          >
            {collapsed ? (
              <>
                <ChevronDown className="h-4 w-4" aria-hidden />
                Expand
              </>
            ) : (
              <>
                <ChevronUp className="h-4 w-4" aria-hidden />
                Collapse
              </>
            )}
          </Button>
        ) : null
      }
    >
      {collapsed && !forceExpanded ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-text">
            Ask about current project conditions, recommendations, decisions,
            Health, Drift, or operational recovery.
          </p>
          <p className="text-xs text-muted-text">{voiceStatus}</p>
        </div>
      ) : (
        <div id="agent-chat-content" className="flex flex-1 flex-col gap-3">
          <VoiceControls status={voiceStatus} />
          <p className="text-xs text-muted-text">
            Answers are grounded in the current Command Center session. Asking a
            question does not process observations or change Health, Drift, or
            decisions.
          </p>

          {messages.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No questions yet"
              description="Ask about current project conditions, recommendations, decisions, Health, Drift, or operational recovery. PulseBuild Agent explains current project facts; it does not autonomously change the project."
            />
          ) : (
            <div
              ref={logRef}
              className="max-h-80 overflow-y-auto rounded-md border border-surface-border bg-surface-elevated/30 p-3"
            >
              <ol aria-label="Agent conversation" className="space-y-3">
                {messages.map((message) => (
                  <li key={message.id}>
                    {message.role === "user" ? (
                      <UserTurn message={message} />
                    ) : (
                      <AgentTurn message={message} />
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-text">
              Suggested questions
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {AGENT_SUGGESTED_QUESTIONS.map((question) => (
                <li key={question}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => submitQuestion(question)}
                  >
                    {question}
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <label
              htmlFor="agent-question"
              className="text-xs font-medium text-muted-text"
            >
              Question
            </label>
            <div className="flex gap-2">
              <input
                id="agent-question"
                name="agent-question"
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoComplete="off"
                placeholder="Ask about the current project"
                className="h-9 min-w-0 flex-1 rounded-md border border-surface-border bg-surface-elevated px-3 text-sm text-slate-100 placeholder:text-muted-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50"
              />
              <Button type="submit" variant="primary" size="sm" disabled={!canSend}>
                Send
              </Button>
            </div>
          </form>
        </div>
      )}
    </Panel>
  );
}

const controlClassName =
  "h-8 rounded-md border border-surface-border bg-surface-elevated px-2 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50 disabled:cursor-not-allowed disabled:opacity-50";

function VoiceControls({ status }: { status: string }) {
  const view = useVoiceStore((state) =>
    presentVoiceControls({
      speechAvailable: state.speechAvailable,
      speaking: state.speaking,
      voices: state.voices,
      lastAnnouncement: state.lastAnnouncement,
      preferences: state.preferences,
    }),
  );
  const setEnabled = useVoiceStore((state) => state.setEnabled);
  const setMuted = useVoiceStore((state) => state.setMuted);
  const setSelectedVoiceURI = useVoiceStore((state) => state.setSelectedVoiceURI);
  const setPreferredVoicePresentation = useVoiceStore(
    (state) => state.setPreferredVoicePresentation,
  );
  const setVolume = useVoiceStore((state) => state.setVolume);

  return (
    <div className="space-y-2 rounded-md border border-surface-border bg-surface-elevated/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-text">
          Voice
        </p>
        <Badge variant={view.speechAvailable ? "status" : "muted"}>{status}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label
          htmlFor="voice-enabled"
          className="flex items-center gap-2 text-xs text-slate-100"
        >
          <input
            id="voice-enabled"
            name="voice-enabled"
            type="checkbox"
            checked={view.enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4 accent-steel-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50"
          />
          Voice enabled
        </label>
        <label
          htmlFor="voice-mute-auto"
          className="flex items-center gap-2 text-xs text-slate-100"
        >
          <input
            id="voice-mute-auto"
            name="voice-mute-auto"
            type="checkbox"
            checked={view.muted}
            onChange={(event) => setMuted(event.target.checked)}
            className="h-4 w-4 accent-steel-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50"
          />
          Mute auto-announcements
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label htmlFor="voice-selector" className="flex flex-col gap-1 text-xs text-muted-text">
          Voice
          <select
            id="voice-selector"
            name="voice-selector"
            value={view.selectedVoiceURI ?? ""}
            disabled={view.playbackDisabled}
            onChange={(event) =>
              setSelectedVoiceURI(event.target.value === "" ? null : event.target.value)
            }
            className={controlClassName}
          >
            <option value="">Browser default</option>
            {view.voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {formatVoiceOptionLabel(voice)}
              </option>
            ))}
            {view.selectedVoiceURI && view.selectedVoiceMissing ? (
              <option value={view.selectedVoiceURI}>
                Saved voice (not in current inventory)
              </option>
            ) : null}
          </select>
        </label>
        <label
          htmlFor="voice-presentation"
          className="flex flex-col gap-1 text-xs text-muted-text"
        >
          Preferred presentation
          <select
            id="voice-presentation"
            name="voice-presentation"
            value={view.preferredVoicePresentation}
            onChange={(event) =>
              setPreferredVoicePresentation(
                event.target.value as (typeof VOICE_PRESENTATION_OPTIONS)[number]["value"],
              )
            }
            className={controlClassName}
          >
            {VOICE_PRESENTATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor="voice-volume" className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-muted-text">
          Volume {view.volumePercent}%
          <input
            id="voice-volume"
            name="voice-volume"
            type="range"
            min={0}
            max={100}
            step={1}
            value={view.volumePercent}
            disabled={view.playbackDisabled}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view.volumePercent}
            aria-valuetext={`${view.volumePercent} percent`}
            onChange={(event) => setVolume(percentToVolume(Number(event.target.value)))}
            className="h-8 accent-steel-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50 disabled:opacity-50"
          />
        </label>
        <Button
          id="voice-replay"
          type="button"
          variant="secondary"
          size="sm"
          disabled={view.replayDisabled}
          onClick={() => replayLastEligibleAnnouncement()}
        >
          Replay last announcement
        </Button>
      </div>
    </div>
  );
}

function UserTurn({
  message,
}: {
  message: Extract<AgentChatMessage, { role: "user" }>;
}) {
  return (
    <article className="rounded-md border border-surface-border bg-steel-blue/20 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-signal-cyan">
        You
      </p>
      <p className="mt-1 text-sm text-slate-100">{message.text}</p>
      <p className="font-data mt-1 text-xs text-muted-text">
        Simulated {message.generatedAtSimulated}
      </p>
    </article>
  );
}

function AgentTurn({ message }: { message: AgentTurnMessage }) {
  const presented = presentAgentResponse(message.response);
  const groundingVariant =
    presented.grounding === "grounded"
      ? "status"
      : presented.grounding === "unsupported"
        ? "muted"
        : "tier2";

  return (
    <article className="rounded-md border border-surface-border bg-surface-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-100">
          PulseBuild Agent
        </p>
        <Badge variant={groundingVariant}>{presented.groundingLabel}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-text">{presented.groundingDetail}</p>
      <p className="mt-2 text-sm text-slate-100">{presented.answerText}</p>
      {presented.grounding !== "grounded" &&
      presented.unsupportedReason &&
      presented.unsupportedReason !== presented.answerText ? (
        <p className="mt-2 text-xs text-muted-text">{presented.unsupportedReason}</p>
      ) : null}
      {presented.grounding === "grounded" && presented.evidenceRefs.length > 0 ? (
        <EvidenceList refs={presented.evidenceRefs} />
      ) : null}
      <p className="font-data mt-2 text-xs text-muted-text">
        Simulated {presented.generatedAtSimulated}
      </p>
    </article>
  );
}

function EvidenceList({
  refs,
}: {
  refs: readonly {
    entityType: string;
    entityId: string;
    fact: string;
  }[];
}) {
  return (
    <div className="mt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-text">
        Evidence
      </p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {refs.map((ref) => {
          const href = evidenceSignalHref(ref);
          const body = (
            <>
              <span className="font-medium text-slate-100">
                {evidenceChipLabel(ref)}
              </span>
              <span className="mt-0.5 block text-muted-text">{ref.fact}</span>
            </>
          );
          return (
            <li key={`${ref.entityType}:${ref.entityId}:${ref.fact}`}>
              {href ? (
                <Link
                  href={href}
                  className={cn(
                    "block max-w-xs rounded-md border border-surface-border bg-surface-elevated/60 px-2 py-1 text-xs",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan/50",
                  )}
                >
                  {body}
                </Link>
              ) : (
                <div className="max-w-xs rounded-md border border-surface-border bg-surface-elevated/60 px-2 py-1 text-xs">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
