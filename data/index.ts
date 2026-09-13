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
import { validateHarborPointSeedSnapshot } from "@/domain/validation/validateHarborPointSeedSnapshot";
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
  const generic = validateProjectSnapshot(snapshot);
  const harborPoint = validateHarborPointSeedSnapshot(snapshot);
  const errors = [...generic.errors, ...harborPoint.errors];
  if (errors.length > 0) {
    throw new Error(`Invalid project snapshot:\n${errors.join("\n")}`);
  }
  return snapshot;
}
