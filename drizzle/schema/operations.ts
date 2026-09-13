/**
 * Production operational persistence. Durable committed facts and workflow
 * history only. Domain engines remain the calculation authority.
 *
 * JSON columns are limited to intentionally polymorphic payloads:
 * observation raw data, FSM command tuples, analysis/recommendation audit,
 * recovery evidence arrays, effect application change lists, and score
 * breakdowns.
 */

import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";

import { utcTimestamp } from "@/drizzle/schema/columns";
import {
  operationalCommandKindEnum,
  operationalDecisionCommandTypeEnum,
  operationalDecisionStateEnum,
  operationalEffectApplicationOutcomeEnum,
  operationalFixtureSourceTypeEnum,
  operationalRecoveryEventTypeEnum,
  operationalSignalTypeEnum,
} from "@/drizzle/schema/enums";
import { organizations, users } from "@/drizzle/schema/identity";
import { projects } from "@/drizzle/schema/projects";

export const operationalHeads = pgTable(
  "operational_heads",
  {
    projectId: text("project_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    workflowVersion: integer("workflow_version").notNull(),
    commandSeq: integer("command_seq").notNull(),
    replayBaselineAt: utcTimestamp("replay_baseline_at"),
    currentlyRecoveredIssueIds: jsonb("currently_recovered_issue_ids")
      .$type<string[]>()
      .notNull(),
    updatedAt: utcTimestamp("updated_at"),
  },
  (table) => [
    unique("operational_heads_project_organization_unique").on(
      table.projectId,
      table.organizationId,
    ),
    index("operational_heads_organization_id_idx").on(table.organizationId),
    foreignKey({
      name: "operational_heads_organization_id_fk",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_heads_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
  ],
);

export const operationalObservations = pgTable(
  "operational_observations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    sequenceOrder: integer("sequence_order").notNull(),
    signalType: operationalSignalTypeEnum("signal_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    sourceType: operationalFixtureSourceTypeEnum("source_type").notNull(),
    relatedEntityType: text("related_entity_type").notNull(),
    relatedEntityId: text("related_entity_id").notNull(),
    relatedTaskId: text("related_task_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull(),
    committedAt: utcTimestamp("committed_at"),
    actorUserId: text("actor_user_id").notNull(),
    provenance: text("provenance").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    unique("operational_observations_project_idempotency_unique").on(
      table.projectId,
      table.organizationId,
      table.idempotencyKey,
    ),
    unique("operational_observations_project_sequence_unique").on(
      table.projectId,
      table.organizationId,
      table.sequenceOrder,
    ),
    index("operational_observations_project_org_idx").on(
      table.projectId,
      table.organizationId,
    ),
    foreignKey({
      name: "operational_observations_org_fk",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_observations_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_observations_actor_fk",
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
  ],
);

export const operationalCommands = pgTable(
  "operational_commands",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    seq: integer("seq").notNull(),
    kind: operationalCommandKindEnum("kind").notNull(),
    observationId: text("observation_id"),
    decisionId: text("decision_id"),
    actorUserId: text("actor_user_id").notNull(),
    committedAt: utcTimestamp("committed_at"),
    idempotencyKey: text("idempotency_key").notNull(),
    fsmCommands: jsonb("fsm_commands").$type<unknown>().notNull(),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    unique("operational_commands_project_seq_unique").on(
      table.projectId,
      table.organizationId,
      table.seq,
    ),
    unique("operational_commands_project_idempotency_unique").on(
      table.projectId,
      table.organizationId,
      table.idempotencyKey,
    ),
    index("operational_commands_project_org_idx").on(
      table.projectId,
      table.organizationId,
    ),
    foreignKey({
      name: "operational_commands_org_fk",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_commands_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_commands_actor_fk",
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_commands_observation_fk",
      columns: [table.observationId],
      foreignColumns: [operationalObservations.id],
    }).onDelete("restrict"),
  ],
);

export const operationalReasonings = pgTable(
  "operational_reasonings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    observationId: text("observation_id").notNull(),
    signalId: text("signal_id").notNull(),
    issueId: text("issue_id"),
    recommendationId: text("recommendation_id"),
    commandId: text("command_id").notNull(),
    analysisPayload: jsonb("analysis_payload").notNull(),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    unique("operational_reasonings_project_signal_unique").on(
      table.projectId,
      table.organizationId,
      table.signalId,
    ),
    index("operational_reasonings_project_org_idx").on(
      table.projectId,
      table.organizationId,
    ),
    foreignKey({
      name: "operational_reasonings_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_reasonings_observation_fk",
      columns: [table.observationId],
      foreignColumns: [operationalObservations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_reasonings_command_fk",
      columns: [table.commandId],
      foreignColumns: [operationalCommands.id],
    }).onDelete("restrict"),
  ],
);

export const operationalRecommendations = pgTable(
  "operational_recommendations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    signalId: text("signal_id").notNull(),
    issueId: text("issue_id"),
    commandId: text("command_id").notNull(),
    primaryAction: text("primary_action").notNull(),
    approvalRequired: boolean("approval_required").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    unique("operational_recommendations_project_id_unique").on(
      table.projectId,
      table.organizationId,
      table.id,
    ),
    index("operational_recommendations_project_org_idx").on(
      table.projectId,
      table.organizationId,
    ),
    foreignKey({
      name: "operational_recommendations_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_recommendations_command_fk",
      columns: [table.commandId],
      foreignColumns: [operationalCommands.id],
    }).onDelete("restrict"),
  ],
);

export const operationalDecisions = pgTable(
  "operational_decisions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    recommendationId: text("recommendation_id").notNull(),
    signalId: text("signal_id").notNull(),
    issueId: text("issue_id"),
    state: operationalDecisionStateEnum("state").notNull(),
    actorUserId: text("actor_user_id"),
    selectedAction: text("selected_action"),
    selectedActionSource: text("selected_action_source"),
    mutatesOperationalState: boolean("mutates_operational_state").notNull(),
    approvalRequired: boolean("approval_required").notNull(),
    createdAtSimulated: utcTimestamp("created_at_simulated"),
    updatedAtSimulated: utcTimestamp("updated_at_simulated"),
    auditTrail: jsonb("audit_trail").notNull(),
    updatedAt: utcTimestamp("updated_at"),
  },
  (table) => [
    unique("operational_decisions_project_id_unique").on(
      table.projectId,
      table.organizationId,
      table.id,
    ),
    index("operational_decisions_project_org_idx").on(
      table.projectId,
      table.organizationId,
    ),
    foreignKey({
      name: "operational_decisions_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
  ],
);

export const operationalDecisionTransitions = pgTable(
  "operational_decision_transitions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    decisionId: text("decision_id").notNull(),
    commandId: text("command_id").notNull(),
    commandType: operationalDecisionCommandTypeEnum("command_type").notNull(),
    fromState: operationalDecisionStateEnum("from_state").notNull(),
    toState: operationalDecisionStateEnum("to_state").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    committedAt: utcTimestamp("committed_at"),
    reason: text("reason"),
    notes: text("notes"),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    unique("operational_decision_transitions_audit_unique").on(
      table.projectId,
      table.organizationId,
      table.id,
    ),
    index("operational_decision_transitions_decision_idx").on(
      table.decisionId,
      table.projectId,
      table.organizationId,
    ),
    foreignKey({
      name: "operational_decision_transitions_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_decision_transitions_command_fk",
      columns: [table.commandId],
      foreignColumns: [operationalCommands.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_decision_transitions_actor_fk",
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
  ],
);

export const operationalEffects = pgTable(
  "operational_effects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    commandId: text("command_id").notNull(),
    effectType: text("effect_type").notNull(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    signalId: text("signal_id").notNull(),
    decisionId: text("decision_id"),
    simulatedAt: utcTimestamp("simulated_at"),
    body: jsonb("body").notNull(),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    unique("operational_effects_project_id_unique").on(
      table.projectId,
      table.organizationId,
      table.id,
    ),
    index("operational_effects_project_org_idx").on(
      table.projectId,
      table.organizationId,
    ),
    foreignKey({
      name: "operational_effects_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_effects_command_fk",
      columns: [table.commandId],
      foreignColumns: [operationalCommands.id],
    }).onDelete("restrict"),
  ],
);

export const operationalEffectApplications = pgTable(
  "operational_effect_applications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    effectId: text("effect_id").notNull(),
    commandId: text("command_id").notNull(),
    outcome: operationalEffectApplicationOutcomeEnum("outcome").notNull(),
    result: jsonb("result").notNull(),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    unique("operational_effect_applications_effect_unique").on(
      table.projectId,
      table.organizationId,
      table.effectId,
    ),
    foreignKey({
      name: "operational_effect_applications_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_effect_applications_command_fk",
      columns: [table.commandId],
      foreignColumns: [operationalCommands.id],
    }).onDelete("restrict"),
  ],
);

export const operationalRecoveryEvents = pgTable(
  "operational_recovery_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    commandId: text("command_id").notNull(),
    issueId: text("issue_id").notNull(),
    signalId: text("signal_id").notNull(),
    verificationRuleId: text("verification_rule_id").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    type: operationalRecoveryEventTypeEnum("type").notNull(),
    simulatedAt: utcTimestamp("simulated_at"),
    relatedEntityType: text("related_entity_type").notNull(),
    relatedEntityId: text("related_entity_id").notNull(),
    taskId: text("task_id").notNull(),
    sourceEffectIds: jsonb("source_effect_ids").$type<string[]>().notNull(),
    evidence: jsonb("evidence").notNull(),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    unique("operational_recovery_events_project_id_unique").on(
      table.projectId,
      table.organizationId,
      table.id,
    ),
    unique("operational_recovery_events_episode_unique").on(
      table.projectId,
      table.organizationId,
      table.issueId,
      table.verificationRuleId,
      table.type,
      table.episodeNumber,
    ),
    index("operational_recovery_events_project_org_idx").on(
      table.projectId,
      table.organizationId,
    ),
    foreignKey({
      name: "operational_recovery_events_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_recovery_events_command_fk",
      columns: [table.commandId],
      foreignColumns: [operationalCommands.id],
    }).onDelete("restrict"),
  ],
);

export const operationalTimelineEvents = pgTable(
  "operational_timeline_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    commandId: text("command_id").notNull(),
    kind: text("kind").notNull(),
    signalId: text("signal_id"),
    sequenceOrder: integer("sequence_order").notNull(),
    summary: text("summary").notNull(),
    facts: jsonb("facts").$type<string[]>().notNull(),
    committedAtSimulated: utcTimestamp("committed_at_simulated"),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    unique("operational_timeline_events_project_id_unique").on(
      table.projectId,
      table.organizationId,
      table.id,
    ),
    index("operational_timeline_events_project_seq_idx").on(
      table.projectId,
      table.organizationId,
      table.sequenceOrder,
    ),
    foreignKey({
      name: "operational_timeline_events_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_timeline_events_command_fk",
      columns: [table.commandId],
      foreignColumns: [operationalCommands.id],
    }).onDelete("restrict"),
  ],
);

export const operationalScoreSnapshots = pgTable(
  "operational_score_snapshots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull(),
    commandId: text("command_id").notNull(),
    healthScore: doublePrecision("health_score").notNull(),
    driftScore: doublePrecision("drift_score").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    unique("operational_score_snapshots_command_unique").on(
      table.projectId,
      table.organizationId,
      table.commandId,
    ),
    foreignKey({
      name: "operational_score_snapshots_project_org_fk",
      columns: [table.projectId, table.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }).onDelete("restrict"),
    foreignKey({
      name: "operational_score_snapshots_command_fk",
      columns: [table.commandId],
      foreignColumns: [operationalCommands.id],
    }).onDelete("restrict"),
  ],
);
