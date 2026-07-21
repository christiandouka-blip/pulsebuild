# PulseBuild

A deterministic construction operations platform for proactive project management.

## Vision

PulseBuild converts project observations into deterministic operational recommendations through a transparent reasoning pipeline. Each step—from intake through health and drift scoring—is explicit, inspectable, and reproducible.

Operational truth comes from deterministic reasoning, not AI. Recommendations are proposals grounded in project facts and evidence, not generative speculation.

## Current Status

**Phase 3A is complete.**

### Implemented

- Observation Intake
- Signal Normalization
- Context Builder
- Dependency Engine
- Priority Engine
- Prediction Engine
- Recommendation Engine
- Health Engine
- Drift Engine
- Timeline
- Command Center
- Deterministic reasoning runtime
- Unit tests

### Deferred

- Approval workflow
- Execution
- Verification
- Voice
- Agent reasoning
- External integrations

## Architecture

```
ProjectSnapshot
      ↓
Reasoning Pipeline
      ↓
Runtime Store
      ↓
Command Center
```

`ProjectSnapshot` is the immutable source of operational truth for the seeded project world. The reasoning pipeline reads that snapshot and produces derived conclusions only. Recommendation generation is deterministic and evidence-based: candidates are accepted or rejected from documented facts, then ranked for presentation in the Command Center.

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Zustand
- Vitest

## Development

```bash
npm install
npm run dev
npm run test
npm run lint
npm run build
```

## Repository Principles

- Deterministic-first
- Immutable project snapshot
- No hidden heuristics
- No AI operational truth
- Pure reasoning engines
- Evidence-based recommendations
