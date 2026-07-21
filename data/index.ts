import { seedCrews } from "@/data/seedCrews";
import { seedEquipment } from "@/data/seedEquipment";
import { seedEvidence } from "@/data/seedEvidence";
import { seedInspections } from "@/data/seedInspections";
import { seedMaterials } from "@/data/seedMaterials";
import { seedPermits } from "@/data/seedPermits";
import { seedPhases } from "@/data/seedPhases";
import { seedProject } from "@/data/seedProject";
import { seedScenarioFixtures } from "@/data/seedScenarioFixtures";
import { seedTasks } from "@/data/seedTasks";
import { seedWeather } from "@/data/seedWeather";
import type { ProjectSnapshot } from "@/domain/types/snapshot";
import { validateProjectSnapshot } from "@/domain/validation/validateProjectSnapshot";

export function buildProjectSnapshot(): ProjectSnapshot {
  return {
    project: seedProject,
    phases: seedPhases,
    tasks: seedTasks,
    crews: seedCrews,
    materials: seedMaterials,
    equipment: seedEquipment,
    inspections: seedInspections,
    permits: seedPermits,
    weather: seedWeather,
    evidence: seedEvidence,
    scenarioFixtures: seedScenarioFixtures,
  };
}

export function getInitialProjectSnapshot(): ProjectSnapshot {
  const snapshot = buildProjectSnapshot();
  const validation = validateProjectSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(
      `Invalid project snapshot:\n${validation.errors.join("\n")}`,
    );
  }
  return snapshot;
}
