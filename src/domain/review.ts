import type {
  IsoDate,
  PlannedWorkout,
  WorkoutBlock,
  WorkoutType,
} from "./types";
import { deepFreeze } from "./immutable";

export type WorkoutPrescription = { blocks: WorkoutBlock[] };

export type WorkoutChange =
  | { kind: "create"; workout: PlannedWorkout }
  | {
      kind: "update";
      workoutId: string;
      changes: {
        date?: IsoDate;
        title?: string;
        purpose?: string;
        distanceKm?: number;
        prescription?: WorkoutPrescription;
      };
    }
  | { kind: "delete"; workoutId: string };

export interface AdaptationOption {
  optionId: string;
  label: string;
  summary: string;
  tradeoff: string;
  workoutChanges: WorkoutChange[];
}

export interface ReviewProposal {
  reviewId: string;
  sourceWorkoutId: string;
  expectedPlanVersion: number;
  evidenceRefs: string[];
  rationale: {
    summary: string;
    counterEvidence: string;
    confidence: "low" | "moderate" | "high";
    limitations: string[];
  };
  recommended: AdaptationOption;
  alternative: AdaptationOption;
}

export interface ReviewValidationIssue {
  path: string;
  message: string;
  expected: string;
}

export interface ReviewPreviewRow {
  date: IsoDate;
  before: PlannedWorkout | null;
  after: PlannedWorkout | null;
}

const WORKOUT_TYPES = new Set<WorkoutType>([
  "easy",
  "recovery",
  "long_run",
  "threshold",
  "steady",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isPositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const isDate = (value: unknown): value is IsoDate => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};

function issue(
  issues: ReviewValidationIssue[],
  path: string,
  message: string,
  expected: string,
) {
  issues.push({ path, message, expected });
}

function hasOnly(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validBlock(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.kind)) return false;
  if (["warmup", "cooldown", "easy"].includes(value.kind)) {
    return (
      hasOnly(value, ["kind", "distanceKm"]) && isPositive(value.distanceKm)
    );
  }
  if (value.kind !== "repeat") return false;
  const pace = value.targetPaceSecondsPerKm;
  return (
    hasOnly(value, [
      "kind",
      "repetitions",
      "workDistanceKm",
      "targetPaceSecondsPerKm",
      "recoverySeconds",
    ]) &&
    Number.isInteger(value.repetitions) &&
    Number(value.repetitions) > 0 &&
    isPositive(value.workDistanceKm) &&
    isRecord(pace) &&
    hasOnly(pace, ["min", "max"]) &&
    isPositive(pace.min) &&
    isPositive(pace.max) &&
    pace.min <= pace.max &&
    typeof value.recoverySeconds === "number" &&
    Number.isFinite(value.recoverySeconds) &&
    value.recoverySeconds >= 0
  );
}

function validPrescription(value: unknown): value is WorkoutPrescription {
  return (
    isRecord(value) &&
    hasOnly(value, ["blocks"]) &&
    Array.isArray(value.blocks) &&
    value.blocks.length > 0 &&
    value.blocks.every(validBlock)
  );
}

function validWorkout(value: unknown): value is PlannedWorkout {
  return (
    isRecord(value) &&
    hasOnly(value, [
      "id",
      "date",
      "type",
      "title",
      "purpose",
      "distanceKm",
      "prescription",
    ]) &&
    isText(value.id) &&
    isDate(value.date) &&
    typeof value.type === "string" &&
    WORKOUT_TYPES.has(value.type as WorkoutType) &&
    isText(value.title) &&
    isText(value.purpose) &&
    isPositive(value.distanceKm) &&
    validPrescription(value.prescription)
  );
}

function validateOption(
  value: unknown,
  path: "recommended" | "alternative",
  workoutIds: Set<string>,
  issues: ReviewValidationIssue[],
) {
  if (!isRecord(value)) {
    issue(
      issues,
      path,
      `${path} must be an object.`,
      "one complete adaptation option",
    );
    return;
  }
  if (
    !hasOnly(value, [
      "optionId",
      "label",
      "summary",
      "tradeoff",
      "workoutChanges",
    ])
  ) {
    issue(
      issues,
      path,
      `${path} contains an unsupported field.`,
      "only optionId, label, summary, tradeoff, and workoutChanges",
    );
  }
  for (const field of ["optionId", "label", "summary", "tradeoff"] as const) {
    if (!isText(value[field])) {
      issue(
        issues,
        `${path}.${field}`,
        `${field} must be non-empty.`,
        "a non-empty string",
      );
    }
  }
  if (
    !Array.isArray(value.workoutChanges) ||
    value.workoutChanges.length === 0
  ) {
    issue(
      issues,
      `${path}.workoutChanges`,
      "workoutChanges must not be empty.",
      "one or more exact Workout Changes",
    );
    return;
  }
  const targets = new Set<string>();
  value.workoutChanges.forEach((change, index) => {
    const changePath = `${path}.workoutChanges[${index}]`;
    if (!isRecord(change) || !isText(change.kind)) {
      issue(
        issues,
        changePath,
        "Workout Change is malformed.",
        "a create, update, or delete change",
      );
      return;
    }
    if (change.kind === "create") {
      if (
        !hasOnly(change, ["kind", "workout"]) ||
        !validWorkout(change.workout)
      ) {
        issue(
          issues,
          `${changePath}.workout`,
          "Created Planned Workout is invalid.",
          "one complete valid Planned Workout",
        );
      } else if (
        workoutIds.has(change.workout.id) ||
        targets.has(change.workout.id)
      ) {
        issue(
          issues,
          `${changePath}.workout.id`,
          "Planned Workout ID is already in use.",
          "a new stable Planned Workout ID",
        );
      } else {
        targets.add(change.workout.id);
      }
      return;
    }
    if (change.kind !== "update" && change.kind !== "delete") {
      issue(
        issues,
        `${changePath}.kind`,
        "Workout Change kind is unsupported.",
        "create, update, or delete",
      );
      return;
    }
    if (
      !hasOnly(
        change,
        change.kind === "update"
          ? ["kind", "workoutId", "changes"]
          : ["kind", "workoutId"],
      )
    ) {
      issue(
        issues,
        changePath,
        "Workout Change contains an unsupported field.",
        `only fields supported by ${change.kind}`,
      );
    }
    if (!isText(change.workoutId) || !workoutIds.has(change.workoutId)) {
      issue(
        issues,
        `${changePath}.workoutId`,
        "Referenced Planned Workout does not exist.",
        "a current stable Planned Workout ID",
      );
    } else if (targets.has(change.workoutId)) {
      issue(
        issues,
        `${changePath}.workoutId`,
        "The option changes one Planned Workout more than once.",
        "each Planned Workout targeted at most once per option",
      );
    } else {
      targets.add(change.workoutId);
    }
    if (change.kind === "delete") return;
    if (!isRecord(change.changes) || Object.keys(change.changes).length === 0) {
      issue(
        issues,
        `${changePath}.changes`,
        "Update changes must not be empty.",
        "at least one supported replacement field",
      );
      return;
    }
    if (
      !hasOnly(change.changes, [
        "date",
        "title",
        "purpose",
        "distanceKm",
        "prescription",
      ])
    ) {
      issue(
        issues,
        `${changePath}.changes`,
        "Update contains an unsupported field.",
        "only date, title, purpose, distanceKm, and prescription",
      );
    }
    if (change.changes.date !== undefined && !isDate(change.changes.date)) {
      issue(
        issues,
        `${changePath}.changes.date`,
        "date is invalid.",
        "a YYYY-MM-DD date",
      );
    }
    for (const field of ["title", "purpose"] as const) {
      if (
        change.changes[field] !== undefined &&
        !isText(change.changes[field])
      ) {
        issue(
          issues,
          `${changePath}.changes.${field}`,
          `${field} is invalid.`,
          "a non-empty string",
        );
      }
    }
    if (
      change.changes.distanceKm !== undefined &&
      !isPositive(change.changes.distanceKm)
    ) {
      issue(
        issues,
        `${changePath}.changes.distanceKm`,
        "distanceKm is invalid.",
        "a positive finite number of kilometres",
      );
    }
    if (
      change.changes.prescription !== undefined &&
      !validPrescription(change.changes.prescription)
    ) {
      issue(
        issues,
        `${changePath}.changes.prescription`,
        "prescription is invalid.",
        "one complete valid Workout prescription",
      );
    }
  });
}

export function validateAdaptationOption(
  value: unknown,
  plannedWorkouts: PlannedWorkout[],
):
  | { valid: true; option: AdaptationOption }
  | { valid: false; issues: ReviewValidationIssue[] } {
  const issues: ReviewValidationIssue[] = [];
  validateOption(
    value,
    "recommended",
    new Set(plannedWorkouts.map(({ id }) => id)),
    issues,
  );
  return issues.length === 0
    ? {
        valid: true,
        option: deepFreeze(
          structuredClone(value as unknown as AdaptationOption),
        ),
      }
    : { valid: false, issues };
}

export function validateReviewProposal(
  value: unknown,
  context: {
    planVersion: number;
    plannedWorkouts: PlannedWorkout[];
    evidenceRefs: Set<string>;
  },
):
  | { valid: true; proposal: ReviewProposal }
  | { valid: false; issues: ReviewValidationIssue[]; stale: boolean } {
  const issues: ReviewValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      stale: false,
      issues: [
        {
          path: "$",
          message: "Review proposal must be an object.",
          expected: "one complete ReviewProposal object",
        },
      ],
    };
  }
  if (
    !hasOnly(value, [
      "reviewId",
      "sourceWorkoutId",
      "expectedPlanVersion",
      "evidenceRefs",
      "rationale",
      "recommended",
      "alternative",
    ])
  ) {
    issue(
      issues,
      "$",
      "Review proposal contains an unsupported field.",
      "only fields in ReviewProposal contract 1.1",
    );
  }
  if (!isText(value.reviewId))
    issue(
      issues,
      "reviewId",
      "reviewId must be non-empty.",
      "a stable non-empty review identifier",
    );
  const workoutIds = new Set(context.plannedWorkouts.map(({ id }) => id));
  if (
    !isText(value.sourceWorkoutId) ||
    !workoutIds.has(value.sourceWorkoutId)
  ) {
    issue(
      issues,
      "sourceWorkoutId",
      "Source Planned Workout does not exist.",
      "a current stable Planned Workout ID",
    );
  }
  const hasPlanVersion =
    Number.isInteger(value.expectedPlanVersion) &&
    Number(value.expectedPlanVersion) > 0;
  const stale =
    hasPlanVersion && value.expectedPlanVersion !== context.planVersion;
  if (!hasPlanVersion || stale) {
    issue(
      issues,
      "expectedPlanVersion",
      "Proposal is not based on the current Training Plan.",
      `current planVersion ${context.planVersion}`,
    );
  }
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length === 0) {
    issue(
      issues,
      "evidenceRefs",
      "evidenceRefs must not be empty.",
      "one or more stable references returned by context reads",
    );
  } else {
    const seen = new Set<string>();
    value.evidenceRefs.forEach((ref, index) => {
      if (!isText(ref) || !context.evidenceRefs.has(ref) || seen.has(ref)) {
        issue(
          issues,
          `evidenceRefs[${index}]`,
          "Evidence reference is invalid or duplicated.",
          "a unique stable evidence reference returned by a current context read",
        );
      }
      if (typeof ref === "string") seen.add(ref);
    });
  }
  const rationale = value.rationale;
  if (
    !isRecord(rationale) ||
    !hasOnly(rationale, [
      "summary",
      "counterEvidence",
      "confidence",
      "limitations",
    ])
  ) {
    issue(
      issues,
      "rationale",
      "rationale is malformed.",
      "summary, counterEvidence, confidence, and limitations",
    );
  } else {
    for (const field of ["summary", "counterEvidence"] as const) {
      if (!isText(rationale[field]))
        issue(
          issues,
          `rationale.${field}`,
          `${field} must be non-empty.`,
          "a non-empty string",
        );
    }
    if (!["low", "moderate", "high"].includes(String(rationale.confidence))) {
      issue(
        issues,
        "rationale.confidence",
        "confidence is invalid.",
        "low, moderate, or high",
      );
    }
    if (
      !Array.isArray(rationale.limitations) ||
      rationale.limitations.length === 0 ||
      rationale.limitations.some((item) => !isText(item))
    ) {
      issue(
        issues,
        "rationale.limitations",
        "limitations are invalid.",
        "one or more non-empty limitations",
      );
    }
  }
  validateOption(value.recommended, "recommended", workoutIds, issues);
  validateOption(value.alternative, "alternative", workoutIds, issues);
  if (
    isRecord(value.recommended) &&
    isRecord(value.alternative) &&
    isText(value.recommended.optionId) &&
    value.recommended.optionId === value.alternative.optionId
  ) {
    issue(
      issues,
      "alternative.optionId",
      "Option IDs must be distinct.",
      "an identifier different from recommended.optionId",
    );
  }
  return issues.length === 0
    ? {
        valid: true,
        proposal: deepFreeze(
          structuredClone(value as unknown as ReviewProposal),
        ),
      }
    : { valid: false, issues, stale };
}

export function buildReviewPreview(
  plannedWorkouts: PlannedWorkout[],
  option: AdaptationOption,
): ReviewPreviewRow[] {
  const byId = new Map(plannedWorkouts.map((workout) => [workout.id, workout]));
  return deepFreeze(
    option.workoutChanges.map((change) => {
      if (change.kind === "create") {
        return {
          date: change.workout.date,
          before: null,
          after: structuredClone(change.workout),
        };
      }
      const before = byId.get(change.workoutId)!;
      if (change.kind === "delete") {
        return {
          date: before.date,
          before: structuredClone(before),
          after: null,
        };
      }
      const after = {
        ...structuredClone(before),
        ...structuredClone(change.changes),
      };
      return { date: after.date, before: structuredClone(before), after };
    }),
  );
}
