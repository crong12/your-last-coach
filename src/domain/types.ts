import type { ReviewProposal } from "./review";

export interface AthleteProfileValue<T> {
  value: T;
  provenance: "seeded_athlete_profile";
  effectiveAt?: string;
}

export type IsoDate = `${number}-${number}-${number}`;

export interface Athlete {
  id: string;
  displayName: string;
  profile: {
    normalWeeklyVolumeKm: AthleteProfileValue<{ min: number; max: number }>;
    recentHalfMarathonSeconds: AthleteProfileValue<number>;
    thresholdPaceSecondsPerKm: AthleteProfileValue<number>;
    preferredLongRunDay: AthleteProfileValue<"Sunday">;
    maximumWeekdayTrainingDurationMinutes: AthleteProfileValue<number>;
  };
}

export interface TargetRace {
  id: string;
  name: string;
  date: IsoDate;
  distanceKm: number;
  objectiveSeconds: number;
}

export interface CoachingEvidenceSource {
  adapter: "synthetic-coros-shaped";
  readAt: string;
  label: "seeded synthetic COROS-shaped observations";
}

export interface SleepStages {
  deepRatio?: number | null;
  lightRatio?: number | null;
  remRatio?: number | null;
  awakeRatio?: number | null;
}

export interface ReadinessHistoryRecord {
  date: IsoDate;
  hrvMs?: number | null;
  restingHeartRateBpm?: number | null;
  sleep?: {
    durationMinutes?: number | null;
    stages?: SleepStages;
  };
  source: CoachingEvidenceSource;
}

export interface TrainingPhaseHistoryRecord {
  id: string;
  date: IsoDate;
  phaseId: string;
  name: string;
}

export interface TrainingPhase {
  id: string;
  name: string;
}

export type WorkoutType =
  "easy" | "recovery" | "long_run" | "threshold" | "steady";

export type ActivityKind = "outdoor_run" | "indoor_run" | "trail_run" | "other";

export type WorkoutBlock =
  | { kind: "warmup" | "cooldown" | "easy"; distanceKm: number }
  | {
      kind: "repeat";
      repetitions: number;
      workDistanceKm: number;
      targetPaceSecondsPerKm: { min: number; max: number };
      recoverySeconds: number;
    };

export interface PlannedWorkoutTargets {
  paceSecondsPerKm?: { min: number; max: number };
  effortGuidance?: string;
  durationSeconds?: { min: number; max: number };
  recoveryProtocol?: string;
}

export interface PlannedWorkout {
  id: string;
  date: IsoDate;
  type: WorkoutType;
  title: string;
  purpose: string;
  distanceKm: number;
  prescription: { blocks: WorkoutBlock[] };
  targets?: PlannedWorkoutTargets;
}

export interface WorkoutLap {
  id: string;
  kind: "warmup" | "work" | "recovery" | "cooldown";
  distanceKm: number;
  paceSecondsPerKm?: number;
  averageHeartRateBpm?: number;
  maximumHeartRateBpm?: number;
}

export interface WorkoutResult {
  id: string;
  plannedWorkoutId?: string;
  startedAt: string;
  status: "completed" | "partial" | "stopped";
  provenance?: string;
  summary: {
    distanceKm: number;
    durationSeconds?: number;
    completedWorkRepetitions?: number;
    plannedWorkRepetitions?: number;
    trainingLoad?: number;
    averagePaceSecondsPerKm?: number;
    averageHeartRateBpm?: number;
    activityKind?: ActivityKind;
  };
  source?: CoachingEvidenceSource;
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
  source: CoachingEvidenceSource;
  readinessHistory: ReadinessHistoryRecord[];
}

export interface AthleteFeedback {
  id: string;
  requestId: string;
  relatedWorkoutId: string;
  relatedWorkoutResultId?: string;
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
  evidenceRefs: string[];
}

export interface PendingAdaptationProposal {
  proposal: ReviewProposal;
  openedAt: string;
  expiresAt: string;
  selectedOptionId: string | null;
}

export interface DeclinedPlanAdaptation {
  status: "declined";
  reviewId: string;
  selectedOption: { optionId: string; label: string } | null;
  recommendation: { label: string; summary: string };
  declinedAt: string;
  planVersion: number;
  evidenceRefs: string[];
}

export interface CoachingTopic {
  id: string;
  title: string;
  status: "monitoring";
  athleteReport: string;
  firstReportedAt: string;
  latestReportedAt: string;
  evidenceRefs: string[];
  followUpCondition: string;
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
    buildStartDate: IsoDate;
    plannedWorkouts: PlannedWorkout[];
  };
  trainingPhaseHistory: TrainingPhaseHistoryRecord[];
  athleteFeedback: AthleteFeedback[];
  coachingTopics: CoachingTopic[];
  processedRequestIds: string[];
  appliedReviewIds: string[];
  adaptationReceipts: AppliedPlanAdaptation[];
  declinedAdaptations: DeclinedPlanAdaptation[];
  pendingAdaptationProposal?: PendingAdaptationProposal;
  mutationHistory: WorkspaceMutation[];
}

export interface CoachingContextSource {
  loadContext(): Promise<WorkspaceState>;
}
