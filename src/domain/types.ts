export type IsoDate = `${number}-${number}-${number}`;

export interface Athlete {
  id: string;
  displayName: string;
  normalWeeklyVolumeKm: { min: number; max: number };
  recentHalfMarathonSeconds: number;
  thresholdPaceSecondsPerKm: number;
}

export interface TargetRace {
  id: string;
  name: string;
  date: IsoDate;
  distanceKm: number;
  objectiveSeconds: number;
}

export interface TrainingPhase {
  id: string;
  name: string;
}

export type WorkoutType =
  "easy" | "recovery" | "long_run" | "threshold" | "steady";

export type WorkoutBlock =
  | { kind: "warmup" | "cooldown" | "easy"; distanceKm: number }
  | {
      kind: "repeat";
      repetitions: number;
      workDistanceKm: number;
      targetPaceSecondsPerKm: { min: number; max: number };
      recoverySeconds: number;
    };

export interface PlannedWorkout {
  id: string;
  date: IsoDate;
  type: WorkoutType;
  title: string;
  purpose: string;
  distanceKm: number;
  prescription: { blocks: WorkoutBlock[] };
}

export interface WorkoutLap {
  id: string;
  kind: "warmup" | "work" | "recovery" | "cooldown";
  distanceKm: number;
  paceSecondsPerKm?: number;
  averageHeartRateBpm?: number;
}

export interface WorkoutResult {
  id: string;
  plannedWorkoutId?: string;
  startedAt: string;
  status: "completed" | "partial" | "stopped";
  summary: {
    distanceKm: number;
    durationSeconds?: number;
    completedWorkRepetitions?: number;
    plannedWorkRepetitions?: number;
  };
  laps: WorkoutLap[];
}

export interface SyntheticCorosShapedSnapshot {
  adapter: "synthetic-coros-shaped";
  asOf: string;
  provenance: string;
  trainingLoad: { shortTerm: number; longTerm: number; ratio: number };
  recovery: { percent: number; classification: "partially_recovered" };
  sleep: { durationMinutes: number; score: number };
  sleepHrvMs: { value: number; syntheticNormalRange: [number, number] };
  restingHeartRateBpm: number;
  dailyStress: "unremarkable";
}

export interface AthleteFeedback {
  id: string;
  requestId: string;
  relatedWorkoutId: string;
  rawText: string;
  reported?: {
    sessionRpe?: number;
    legFeel?: string;
    painReported?: boolean;
    stoppedReason?: string;
  };
  recordedAt: string;
}

export interface WorkspaceMutation {
  id: string;
  kind: "reset" | "plan_adaptation";
  occurredAt: string;
}

export interface AppliedPlanAdaptation {
  reviewId: string;
  selectedOption: { optionId: string; label: string };
  affectedWorkouts: Array<{
    workoutId: string;
    before: PlannedWorkout | null;
    after: PlannedWorkout | null;
  }>;
  appliedAt: string;
  planVersionBefore: number;
  planVersionAfter: number;
}

export interface WorkspaceState {
  seedVersion: "demo-athlete-v1";
  clock: { now: string; timeZone: "Europe/London" };
  athlete: Athlete;
  targetRace: TargetRace;
  trainingPhase: TrainingPhase;
  observations: SyntheticCorosShapedSnapshot;
  workoutResults: WorkoutResult[];
  trainingPlan: {
    planVersion: number;
    plannedWorkouts: PlannedWorkout[];
  };
  athleteFeedback: AthleteFeedback[];
  processedRequestIds: string[];
  appliedReviewIds: string[];
  adaptationReceipts: AppliedPlanAdaptation[];
  mutationHistory: WorkspaceMutation[];
}

export interface CoachingContextSource {
  loadContext(): Promise<WorkspaceState>;
}
