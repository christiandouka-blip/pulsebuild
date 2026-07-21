"use client";

import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";

import { EmptyState } from "@/components/layout/EmptyState";
import { Panel } from "@/components/layout/Panel";
import { Button } from "@/components/layout/Button";
import { useUIStore } from "@/store/useUIStore";

type AgentChatPanelShellProps = {
  forceExpanded?: boolean;
};

export function AgentChatPanelShell({
  forceExpanded = false,
}: AgentChatPanelShellProps) {
  const isChatCollapsed = useUIStore((state) => state.isChatCollapsed);
  const toggleChatCollapsed = useUIStore((state) => state.toggleChatCollapsed);

  const collapsed = forceExpanded ? false : isChatCollapsed;

  return (
    <Panel
      id="agent-chat"
      title="Agent Chat"
      description="Conversational access to the Reflex Engine"
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
        <p className="text-sm text-muted-text">
          Ask operational questions once monitoring begins — what is blocking
          work, why health dropped, and whether the last action worked.
        </p>
      ) : (
        <div id="agent-chat-content">
          <EmptyState
            icon={MessageSquare}
            title="Structured agent responses will appear here"
            description="The chat is the conversational interface to the Reflex Engine — not a general assistant. Responses will follow Situation, Priority, Evidence, Impact, Recommendation, Approval, and Verification using project data only."
          />
        </div>
      )}
    </Panel>
  );
}
