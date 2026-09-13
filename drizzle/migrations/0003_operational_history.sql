CREATE TYPE "public"."operational_command_kind" AS ENUM('observation', 'decision_transition');--> statement-breakpoint
CREATE TYPE "public"."operational_decision_command_type" AS ENUM('AcknowledgeDecision', 'ApproveDecision', 'RejectDecision', 'ProceedAfterApproval', 'MarkExecutionComplete', 'AdvanceToVerification', 'BlockExecution', 'RetryExecution', 'CancelDecision', 'VerifyDecision', 'FailVerification');--> statement-breakpoint
CREATE TYPE "public"."operational_decision_state" AS ENUM('PendingReview', 'Acknowledged', 'Approved', 'PendingExecution', 'Executed', 'Blocked', 'AwaitingVerification', 'VerificationFailed', 'Verified', 'Rejected', 'Cancelled');--> statement-breakpoint
CREATE TYPE "public"."operational_effect_application_outcome" AS ENUM('Applied', 'AlreadyApplied', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."operational_fixture_source_type" AS ENUM('simulation', 'seed', 'user', 'system');--> statement-breakpoint
CREATE TYPE "public"."operational_recovery_event_type" AS ENUM('Recovered', 'Reopened');--> statement-breakpoint
CREATE TYPE "public"."operational_signal_type" AS ENUM('SafetyIncident', 'InspectionFailed', 'InspectionMissing', 'CriticalEquipmentFailure', 'MaterialDeliveryDelayed', 'CrewShortage', 'WeatherAlert', 'PermitPending', 'TaskBehindSchedule', 'MinorDelay', 'TaskComplete', 'DeliveryReceived');--> statement-breakpoint
CREATE TABLE "operational_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" "operational_command_kind" NOT NULL,
	"observation_id" text,
	"decision_id" text,
	"actor_user_id" text NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"idempotency_key" text NOT NULL,
	"fsm_commands" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_commands_project_seq_unique" UNIQUE("project_id","organization_id","seq"),
	CONSTRAINT "operational_commands_project_idempotency_unique" UNIQUE("project_id","organization_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "operational_decision_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"decision_id" text NOT NULL,
	"command_id" text NOT NULL,
	"command_type" "operational_decision_command_type" NOT NULL,
	"from_state" "operational_decision_state" NOT NULL,
	"to_state" "operational_decision_state" NOT NULL,
	"actor_user_id" text NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_decision_transitions_audit_unique" UNIQUE("project_id","organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "operational_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"recommendation_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"issue_id" text,
	"state" "operational_decision_state" NOT NULL,
	"actor_user_id" text,
	"selected_action" text,
	"selected_action_source" text,
	"mutates_operational_state" boolean NOT NULL,
	"approval_required" boolean NOT NULL,
	"created_at_simulated" timestamp with time zone NOT NULL,
	"updated_at_simulated" timestamp with time zone NOT NULL,
	"audit_trail" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_decisions_project_id_unique" UNIQUE("project_id","organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "operational_effect_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"effect_id" text NOT NULL,
	"command_id" text NOT NULL,
	"outcome" "operational_effect_application_outcome" NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_effect_applications_effect_unique" UNIQUE("project_id","organization_id","effect_id")
);
--> statement-breakpoint
CREATE TABLE "operational_effects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"command_id" text NOT NULL,
	"effect_type" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"decision_id" text,
	"simulated_at" timestamp with time zone NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_effects_project_id_unique" UNIQUE("project_id","organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "operational_heads" (
	"project_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"workflow_version" integer NOT NULL,
	"command_seq" integer NOT NULL,
	"replay_baseline_at" timestamp with time zone NOT NULL,
	"currently_recovered_issue_ids" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_heads_project_organization_unique" UNIQUE("project_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "operational_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"sequence_order" integer NOT NULL,
	"signal_type" "operational_signal_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"source_type" "operational_fixture_source_type" NOT NULL,
	"related_entity_type" text NOT NULL,
	"related_entity_id" text NOT NULL,
	"related_task_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"committed_at" timestamp with time zone NOT NULL,
	"actor_user_id" text NOT NULL,
	"provenance" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_observations_project_idempotency_unique" UNIQUE("project_id","organization_id","idempotency_key"),
	CONSTRAINT "operational_observations_project_sequence_unique" UNIQUE("project_id","organization_id","sequence_order")
);
--> statement-breakpoint
CREATE TABLE "operational_reasonings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"observation_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"issue_id" text,
	"recommendation_id" text,
	"command_id" text NOT NULL,
	"analysis_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_reasonings_project_signal_unique" UNIQUE("project_id","organization_id","signal_id")
);
--> statement-breakpoint
CREATE TABLE "operational_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"issue_id" text,
	"command_id" text NOT NULL,
	"primary_action" text NOT NULL,
	"approval_required" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_recommendations_project_id_unique" UNIQUE("project_id","organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "operational_recovery_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"command_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"verification_rule_id" text NOT NULL,
	"episode_number" integer NOT NULL,
	"type" "operational_recovery_event_type" NOT NULL,
	"simulated_at" timestamp with time zone NOT NULL,
	"related_entity_type" text NOT NULL,
	"related_entity_id" text NOT NULL,
	"task_id" text NOT NULL,
	"source_effect_ids" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_recovery_events_project_id_unique" UNIQUE("project_id","organization_id","id"),
	CONSTRAINT "operational_recovery_events_episode_unique" UNIQUE("project_id","organization_id","issue_id","verification_rule_id","type","episode_number")
);
--> statement-breakpoint
CREATE TABLE "operational_score_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"command_id" text NOT NULL,
	"health_score" double precision NOT NULL,
	"drift_score" double precision NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_score_snapshots_command_unique" UNIQUE("project_id","organization_id","command_id")
);
--> statement-breakpoint
CREATE TABLE "operational_timeline_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"command_id" text NOT NULL,
	"kind" text NOT NULL,
	"signal_id" text,
	"sequence_order" integer NOT NULL,
	"summary" text NOT NULL,
	"facts" jsonb NOT NULL,
	"committed_at_simulated" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "operational_timeline_events_project_id_unique" UNIQUE("project_id","organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "operational_commands" ADD CONSTRAINT "operational_commands_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_commands" ADD CONSTRAINT "operational_commands_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_commands" ADD CONSTRAINT "operational_commands_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_commands" ADD CONSTRAINT "operational_commands_observation_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."operational_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_decision_transitions" ADD CONSTRAINT "operational_decision_transitions_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_decision_transitions" ADD CONSTRAINT "operational_decision_transitions_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."operational_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_decision_transitions" ADD CONSTRAINT "operational_decision_transitions_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_decisions" ADD CONSTRAINT "operational_decisions_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_effect_applications" ADD CONSTRAINT "operational_effect_applications_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_effect_applications" ADD CONSTRAINT "operational_effect_applications_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."operational_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_effects" ADD CONSTRAINT "operational_effects_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_effects" ADD CONSTRAINT "operational_effects_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."operational_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_heads" ADD CONSTRAINT "operational_heads_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_heads" ADD CONSTRAINT "operational_heads_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_observations" ADD CONSTRAINT "operational_observations_org_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_observations" ADD CONSTRAINT "operational_observations_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_observations" ADD CONSTRAINT "operational_observations_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_reasonings" ADD CONSTRAINT "operational_reasonings_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_reasonings" ADD CONSTRAINT "operational_reasonings_observation_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."operational_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_reasonings" ADD CONSTRAINT "operational_reasonings_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."operational_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_recommendations" ADD CONSTRAINT "operational_recommendations_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_recommendations" ADD CONSTRAINT "operational_recommendations_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."operational_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_recovery_events" ADD CONSTRAINT "operational_recovery_events_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_recovery_events" ADD CONSTRAINT "operational_recovery_events_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."operational_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_score_snapshots" ADD CONSTRAINT "operational_score_snapshots_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_score_snapshots" ADD CONSTRAINT "operational_score_snapshots_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."operational_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_timeline_events" ADD CONSTRAINT "operational_timeline_events_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."projects"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_timeline_events" ADD CONSTRAINT "operational_timeline_events_command_fk" FOREIGN KEY ("command_id") REFERENCES "public"."operational_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operational_commands_project_org_idx" ON "operational_commands" USING btree ("project_id","organization_id");--> statement-breakpoint
CREATE INDEX "operational_decision_transitions_decision_idx" ON "operational_decision_transitions" USING btree ("decision_id","project_id","organization_id");--> statement-breakpoint
CREATE INDEX "operational_decisions_project_org_idx" ON "operational_decisions" USING btree ("project_id","organization_id");--> statement-breakpoint
CREATE INDEX "operational_effects_project_org_idx" ON "operational_effects" USING btree ("project_id","organization_id");--> statement-breakpoint
CREATE INDEX "operational_heads_organization_id_idx" ON "operational_heads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "operational_observations_project_org_idx" ON "operational_observations" USING btree ("project_id","organization_id");--> statement-breakpoint
CREATE INDEX "operational_reasonings_project_org_idx" ON "operational_reasonings" USING btree ("project_id","organization_id");--> statement-breakpoint
CREATE INDEX "operational_recommendations_project_org_idx" ON "operational_recommendations" USING btree ("project_id","organization_id");--> statement-breakpoint
CREATE INDEX "operational_recovery_events_project_org_idx" ON "operational_recovery_events" USING btree ("project_id","organization_id");--> statement-breakpoint
CREATE INDEX "operational_timeline_events_project_seq_idx" ON "operational_timeline_events" USING btree ("project_id","organization_id","sequence_order");