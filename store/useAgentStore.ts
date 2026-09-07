/**
 * Phase 4B Agent store — chat session only.
 *
 * ask({ question, context }) explains from a caller-supplied AgentContext.
 * Does not import operational stores or advance the workflow clock.
 */

import { create } from "zustand";

import type { AgentContext, AgentResponse } from "@/domain/agent/types";
import { mockExplainer } from "@/lib/agent/explain";

export type AgentUserMessage = {
  id: string;
  role: "user";
  text: string;
  generatedAtSimulated: string;
};

export type AgentTurnMessage = {
  id: string;
  role: "agent";
  response: AgentResponse;
};

export type AgentChatMessage = AgentUserMessage | AgentTurnMessage;

type AgentStoreState = {
  messages: AgentChatMessage[];
  sequence: number;
  ask: (input: { question: string; context: AgentContext }) => AgentResponse;
  clearHistory: () => void;
};

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  messages: [],
  sequence: 0,

  ask: ({ question, context }) => {
    const userSequence = get().sequence + 1;
    const agentSequence = userSequence + 1;
    const userId = `user-msg-${userSequence}`;
    const agentId = `agent-msg-${agentSequence}`;
    const response = mockExplainer.explain(question, context, { id: agentId });
    const userMessage: AgentUserMessage = {
      id: userId,
      role: "user",
      text: question,
      generatedAtSimulated: context.evaluationSimulatedAt,
    };
    const agentMessage: AgentTurnMessage = {
      id: agentId,
      role: "agent",
      response,
    };
    set({
      messages: [...get().messages, userMessage, agentMessage],
      sequence: agentSequence,
    });
    return response;
  },

  clearHistory: () => {
    set({ messages: [], sequence: 0 });
  },
}));
