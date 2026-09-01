import { describe, expect, it } from "vitest";

import { initializeWorkspace } from "../src/application/initializeWorkspace";
import { createWorkspaceApplication } from "../src/application/createWorkspaceApplication";
import type { PersistedWorkspace } from "../src/application/ports";
import type { AppliedPlanAdaptation } from "../src/domain/types";
import { createDemoCoachingContextSource } from "../src/demo/demoCoachingContextSource";
import { migrateDemoWorkspace } from "../src/demo/migrateDemoWorkspace";
import {
  BrowserWorkspaceRepository,
  WORKSPACE_STORAGE_KEY,
} from "../src/adapters/persistence/BrowserWorkspaceRepository";

class ControlledStorage implements Storage {
  private readonly values = new Map<string, string>();
  failReads = false;
  failWrites = false;

  get length() {
    return this.values.size;
  }

  clear(): void {
    if (this.failWrites)
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.values.clear();
  }

  getItem(key: string): string | null {
    if (this.failReads)
      throw new DOMException("Storage denied", "SecurityError");
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    if (this.failWrites)
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failWrites)
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.values.set(key, value);
  }
}

async function fixtureEnvelope(planVersion = 1): Promise<PersistedWorkspace> {
  const state = structuredClone(
    await createDemoCoachingContextSource().loadContext(),
  );
  state.trainingPlan.planVersion = planVersion;
  return {
    schemaVersion: 1,
    seedVersion: "demo-athlete-v1",
    savedAt: "2026-08-26T20:14:00+01:00",
    state,
  };
}

async function approvedEnvelope(): Promise<PersistedWorkspace> {
  const envelope = await fixtureEnvelope(2);
  const workouts = envelope.state.trainingPlan.plannedWorkouts;
  const thursday = structuredClone(
    workouts.find(({ id }) => id === "planned-2026-08-27-recovery")!,
  );
  const saturdayBefore = structuredClone(
    workouts.find(({ id }) => id === "planned-2026-08-29-strides")!,
  );
  const saturdayAfter = {
    ...structuredClone(saturdayBefore),
    title: "6 km easy",
    distanceKm: 6,
    prescription: { blocks: [{ kind: "easy" as const, distanceKm: 6 }] },
  };
  envelope.state.trainingPlan.plannedWorkouts = workouts
    .filter(({ id }) => id !== thursday.id)
    .map((workout) =>
      workout.id === saturdayAfter.id ? saturdayAfter : workout,
    );
  envelope.state.appliedReviewIds = ["review:persisted"];
  envelope.state.adaptationReceipts = [
    {
      reviewId: "review:persisted",
      selectedOption: { optionId: "recovery-first", label: "Recovery first" },
      affectedWorkouts: [
        { workoutId: thursday.id, before: thursday, after: null },
        {
          workoutId: saturdayBefore.id,
          before: saturdayBefore,
          after: saturdayAfter,
        },
      ],
      appliedAt: "2026-08-26T20:15:00+01:00",
      planVersionBefore: 1,
      planVersionAfter: 2,
      evidenceRefs: [
        "planned-workout:planned-2026-08-26-threshold",
        "workout-result:result-2026-08-26-threshold",
        "observation:training-load",
        "observation:recovery",
      ],
    },
  ];
  envelope.state.mutationHistory = [
    {
      id: "plan-adaptation:review:persisted",
      kind: "plan_adaptation",
      occurredAt: "2026-08-26T20:15:00+01:00",
    },
  ];
  return envelope;
}

const INVALID_SAVED_CASES = [
  "malformed JSON",
  "unsupported schema",
  "mismatched seed",
  "invalid workspace state",
] as const;

const MALFORMED_STATE_CASES: Array<
  [string, (state: Record<string, any>) => void]
> = [
  [
    "invalid Planned Workout type",
    (state) => {
      state.trainingPlan.plannedWorkouts[0].type = "race";
    },
  ],
  [
    "incomplete repeat block",
    (state) => {
      delete state.trainingPlan.plannedWorkouts.find(
        (workout: Record<string, unknown>) =>
          workout.id === "planned-2026-08-26-threshold",
      ).prescription.blocks[1].recoverySeconds;
    },
  ],
  [
    "invalid Workout Result lap",
    (state) => {
      state.workoutResults.at(-1).laps[1].kind = "interval";
    },
  ],
  [
    "invalid Athlete Feedback entry",
    (state) => {
      state.athleteFeedback.push({ id: "feedback-without-required-fields" });
    },
  ],
  [
    "invalid Athlete Feedback reported fields",
    (state) => {
      state.athleteFeedback.push({
        id: "athlete-feedback:invalid-reported",
        requestId: "invalid-reported",
        relatedWorkoutId: "planned-2026-08-26-threshold",
        rawText: "Hard session",
        reported: { sessionRpe: 11 },
        recordedAt: "2026-08-26T20:15:00+01:00",
      });
    },
  ],
  [
    "missing processed request identifiers",
    (state) => {
      delete state.processedRequestIds;
    },
  ],
  [
    "missing applied review identifiers",
    (state) => {
      delete state.appliedReviewIds;
    },
  ],
  [
    "missing adaptation receipts",
    (state) => {
      delete state.adaptationReceipts;
    },
  ],
];

describe("browser workspace persistence", () => {
  it("loads and saves a versioned persistent envelope", async () => {
    const storage = new ControlledStorage();
    const repository = new BrowserWorkspaceRepository(() => storage);
    const envelope = await fixtureEnvelope(2);

    expect(await repository.save(envelope)).toBe("persistent");
    expect(JSON.parse(storage.getItem(WORKSPACE_STORAGE_KEY) ?? "")).toEqual(
      envelope,
    );
    expect(await repository.load()).toEqual(envelope);
    expect(repository.durability).toBe("persistent");
  });

  it("keeps the current page state in memory when browser storage is unavailable", async () => {
    const envelope = await fixtureEnvelope(2);
    const repository = new BrowserWorkspaceRepository(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    expect(await repository.save(envelope)).toBe("memory_only");
    expect(await repository.load()).toEqual(envelope);
    expect(repository.durability).toBe("memory_only");

    await repository.clear();
    expect(await repository.load()).toBeNull();
  });

  it("falls back to memory when a storage write fails", async () => {
    const storage = new ControlledStorage();
    storage.failWrites = true;
    const repository = new BrowserWorkspaceRepository(() => storage);
    const envelope = await fixtureEnvelope(2);

    expect(await repository.save(envelope)).toBe("memory_only");
    expect(await repository.load()).toEqual(envelope);
  });

  it("removes stale persistent state during reset after a memory-only fallback", async () => {
    const storage = new ControlledStorage();
    const staleEnvelope = await fixtureEnvelope(2);
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(staleEnvelope));
    const repository = new BrowserWorkspaceRepository(() => storage);

    storage.failWrites = true;
    expect(await repository.save(await fixtureEnvelope(3))).toBe("memory_only");

    storage.failWrites = false;
    await repository.clear();

    const repositoryAfterReload = new BrowserWorkspaceRepository(() => storage);
    expect(await repositoryAfterReload.load()).toBeNull();
  });
});

describe("workspace initialization", () => {
  it("migrates a prior schema-v1 envelope without declinedAdaptations", async () => {
    const envelope = await fixtureEnvelope(2);
    const savedFeedback = {
      id: "athlete-feedback:legacy-saved",
      requestId: "legacy-saved",
      relatedWorkoutId: "planned-2026-08-26-threshold",
      rawText: "The saved threshold session felt heavy.",
      recordedAt: "2026-08-26T20:15:00+01:00",
    };
    envelope.state.athleteFeedback.push(savedFeedback);
    envelope.state.processedRequestIds.push(savedFeedback.requestId);
    envelope.state.trainingPlan.plannedWorkouts[0].title =
      "Saved easy recovery";
    delete (envelope.state as unknown as Record<string, unknown>)
      .declinedAdaptations;
    const storage = new ControlledStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));

    const initialized = await initializeWorkspace({
      fixtureSource: createDemoCoachingContextSource(),
      repository: new BrowserWorkspaceRepository(() => storage),
    });

    expect(initialized.notice).toBeNull();
    expect(initialized.state.declinedAdaptations).toEqual([]);
    expect(initialized.state.trainingPlan.planVersion).toBe(2);
    expect(initialized.state.trainingPlan.plannedWorkouts[0].title).toBe(
      "Saved easy recovery",
    );
    expect(initialized.state.athleteFeedback).toContainEqual(savedFeedback);
  });

  it("restores a valid completed undelivered fallback result from schema version 1", async () => {
    const envelope = await approvedEnvelope();
    envelope.undeliveredFallbackResult = {
      status: "approved",
      ...envelope.state.adaptationReceipts[0],
    };
    const storage = new ControlledStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));

    const initialized = await initializeWorkspace({
      fixtureSource: createDemoCoachingContextSource(),
      repository: new BrowserWorkspaceRepository(() => storage),
    });

    expect(initialized.undeliveredFallbackResult).toEqual(
      envelope.undeliveredFallbackResult,
    );
    expect(initialized.notice).toBeNull();
  });

  it("refreshes schema version 1 state whose approved fallback result has no matching receipt", async () => {
    const envelope = await approvedEnvelope();
    envelope.undeliveredFallbackResult = {
      status: "approved",
      ...envelope.state.adaptationReceipts[0],
      reviewId: "review:missing",
    };
    const storage = new ControlledStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));

    const initialized = await initializeWorkspace({
      fixtureSource: createDemoCoachingContextSource(),
      repository: new BrowserWorkspaceRepository(() => storage),
    });

    expect(initialized.undeliveredFallbackResult).toBeUndefined();
    expect(initialized.notice).toContain("could not be used");
  });

  it.each([
    {
      status: "discuss_further" as const,
      reviewId: "",
    },
    {
      status: "cancelled" as const,
      reviewId: "review:cancelled",
      reason: "",
    },
  ])("refreshes an invalid non-approved fallback result %#", async (result) => {
    const envelope = await fixtureEnvelope();
    envelope.undeliveredFallbackResult = result;
    const storage = new ControlledStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));

    const initialized = await initializeWorkspace({
      fixtureSource: createDemoCoachingContextSource(),
      repository: new BrowserWorkspaceRepository(() => storage),
    });

    expect(initialized.undeliveredFallbackResult).toBeUndefined();
    expect(initialized.notice).toContain("could not be used");
  });

  it("refreshes a non-approved fallback result that contradicts an applied receipt", async () => {
    const envelope = await approvedEnvelope();
    envelope.undeliveredFallbackResult = {
      status: "discuss_further",
      reviewId: "review:persisted",
    };
    const storage = new ControlledStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));

    const initialized = await initializeWorkspace({
      fixtureSource: createDemoCoachingContextSource(),
      repository: new BrowserWorkspaceRepository(() => storage),
    });

    expect(initialized.undeliveredFallbackResult).toBeUndefined();
    expect(initialized.notice).toContain("could not be used");
  });

  it.each([
    [
      "an incomplete affected workout",
      (state: Record<string, any>) => {
        state.adaptationReceipts[0].affectedWorkouts[0].before = {};
      },
    ],
    [
      "an affected workout ID mismatch",
      (state: Record<string, any>) => {
        state.adaptationReceipts[0].affectedWorkouts[0].before.id =
          "another-workout";
      },
    ],
    [
      "an applied-review ID mismatch",
      (state: Record<string, any>) => {
        state.appliedReviewIds = ["review:without-outcome"];
      },
    ],
    [
      "an outcome version later than the Training Plan",
      (state: Record<string, any>) => {
        state.adaptationReceipts[0].planVersionBefore = 2;
        state.adaptationReceipts[0].planVersionAfter = 3;
      },
    ],
  ])("refreshes persisted state containing %s", async (_case, corrupt) => {
    const envelope = await approvedEnvelope();
    corrupt(envelope.state as unknown as Record<string, any>);
    const storage = new ControlledStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));
    const source = createDemoCoachingContextSource();

    const initialized = await initializeWorkspace({
      fixtureSource: source,
      repository: new BrowserWorkspaceRepository(() => storage),
    });

    expect(initialized.state).toEqual(await source.loadContext());
    expect(initialized.notice).toContain("could not be used");
  });

  it("restores and replays a complete persisted Plan Approval outcome", async () => {
    const envelope = await approvedEnvelope();
    const storage = new ControlledStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));
    const source = createDemoCoachingContextSource();
    const repository = new BrowserWorkspaceRepository(() => storage);
    const initialized = await initializeWorkspace({
      fixtureSource: source,
      repository,
    });
    const application = createWorkspaceApplication({
      initialState: initialized.state,
      fixtureSource: source,
      repository,
    });

    expect(application.getPlanApproval("review:persisted")).toMatchObject({
      status: "approved",
      reviewId: "review:persisted",
      planVersionBefore: 1,
      planVersionAfter: 2,
      durability: "persistent",
    });
    expect(initialized.notice).toBeNull();
  });

  it("preserves profile, topics, result links, and receipt evidence through reload", async () => {
    const envelope = await approvedEnvelope();
    const persistedFeedback = {
      id: "athlete-feedback:persisted-with-result",
      requestId: "persisted-with-result",
      relatedWorkoutId: "planned-2026-08-26-threshold",
      relatedWorkoutResultId: "result-2026-08-26-threshold",
      rawText: "The threshold session felt heavy.",
      recordedAt: "2026-08-26T20:15:00+01:00",
    };
    envelope.state.athleteFeedback.push(persistedFeedback);
    envelope.state.processedRequestIds.push(persistedFeedback.requestId);
    const storage = new ControlledStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));
    const source = createDemoCoachingContextSource();
    const repository = new BrowserWorkspaceRepository(() => storage);

    const initialized = await initializeWorkspace({
      fixtureSource: source,
      repository,
    });
    const application = createWorkspaceApplication({
      initialState: initialized.state,
      fixtureSource: source,
      repository,
    });

    expect(initialized.state.athlete.profile).toEqual(
      envelope.state.athlete.profile,
    );
    expect(initialized.state.coachingTopics).toEqual(
      envelope.state.coachingTopics,
    );
    expect(initialized.state.athleteFeedback).toContainEqual(persistedFeedback);
    expect(initialized.state.adaptationReceipts).toEqual(
      envelope.state.adaptationReceipts,
    );
    expect(application.getPlanApproval("review:persisted")).toMatchObject({
      evidenceRefs: envelope.state.adaptationReceipts[0].evidenceRefs,
    });
  });

  it("accepts receipt evidence for a Planned Workout removed by the adaptation", async () => {
    const envelope = await approvedEnvelope();
    const removedWorkoutId = "planned-2026-08-27-recovery";
    const removedWorkoutEvidenceRef = `planned-workout:${removedWorkoutId}`;
    envelope.state.adaptationReceipts[0].evidenceRefs = [
      removedWorkoutEvidenceRef,
      ...envelope.state.adaptationReceipts[0].evidenceRefs,
    ];
    const storage = new ControlledStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));
    const source = createDemoCoachingContextSource();

    const initialized = await initializeWorkspace({
      fixtureSource: source,
      repository: new BrowserWorkspaceRepository(() => storage),
    });

    expect(initialized.notice).toBeNull();
    expect(initialized.state.trainingPlan.plannedWorkouts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: removedWorkoutId }),
      ]),
    );
    expect(initialized.state.adaptationReceipts[0].evidenceRefs).toContain(
      removedWorkoutEvidenceRef,
    );
  });

  it("restores sparse Athlete Feedback from the persisted envelope", async () => {
    const storage = new ControlledStorage();
    const saved = await fixtureEnvelope();
    saved.state.athleteFeedback.push({
      id: "athlete-feedback:persisted",
      requestId: "persisted",
      relatedWorkoutId: "planned-2026-08-26-threshold",
      rawText: "My legs felt heavy.",
      reported: { legFeel: "heavy" },
      recordedAt: "2026-08-26T20:15:00+01:00",
    });
    saved.state.processedRequestIds.push("persisted");
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(saved));

    const initialized = await initializeWorkspace({
      fixtureSource: createDemoCoachingContextSource(),
      repository: new BrowserWorkspaceRepository(() => storage),
    });

    expect(initialized.state.athleteFeedback).toEqual([
      expect.objectContaining({
        id: "athlete-feedback:seed-shin-discomfort",
      }),
      expect.objectContaining({
        id: "athlete-feedback:persisted",
        rawText: "My legs felt heavy.",
        reported: { legFeel: "heavy" },
      }),
    ]);
  });
  it("restores a valid saved workspace", async () => {
    const storage = new ControlledStorage();
    const saved = await fixtureEnvelope(3);
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(saved));
    const repository = new BrowserWorkspaceRepository(() => storage);

    const initialized = await initializeWorkspace({
      fixtureSource: createDemoCoachingContextSource(),
      repository,
    });

    expect(initialized.state.trainingPlan.planVersion).toBe(3);
    expect(initialized.notice).toBeNull();
    expect(initialized.durability).toBe("persistent");
  });

  it("fills newly seeded summary metrics into the existing demo result", async () => {
    const storage = new ControlledStorage();
    const saved = await fixtureEnvelope();
    const result = saved.state.workoutResults.find(
      ({ id }) => id === "result-2026-08-26-threshold",
    );
    expect(result).toBeDefined();
    delete result!.summary.durationSeconds;
    delete result!.summary.averagePaceSecondsPerKm;
    delete result!.summary.averageHeartRateBpm;
    delete result!.summary.trainingLoad;
    const warmup = result!.laps.find(({ id }) => id === "lap-threshold-warmup");
    expect(warmup).toBeDefined();
    delete warmup!.averageHeartRateBpm;
    delete warmup!.maximumHeartRateBpm;
    delete warmup!.paceSecondsPerKm;
    const firstRepetition = result!.laps.find(
      ({ id }) => id === "lap-threshold-rep-1",
    );
    expect(firstRepetition).toBeDefined();
    firstRepetition!.maximumHeartRateBpm = 175;
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(saved));

    const initialized = await initializeWorkspace({
      fixtureSource: createDemoCoachingContextSource(),
      repository: new BrowserWorkspaceRepository(() => storage),
      migrateSaved: migrateDemoWorkspace,
    });

    expect(
      initialized.state.workoutResults.find(
        ({ id }) => id === "result-2026-08-26-threshold",
      )?.summary,
    ).toMatchObject({
      durationSeconds: 2_747,
      averagePaceSecondsPerKm: 366,
      averageHeartRateBpm: 169,
    });
    expect(
      initialized.state.workoutResults
        .find(({ id }) => id === "result-2026-08-26-threshold")
        ?.laps.find(({ id }) => id === "lap-threshold-warmup"),
    ).toMatchObject({
      paceSecondsPerKm: 375,
      averageHeartRateBpm: 130,
      maximumHeartRateBpm: 134,
    });
    expect(
      initialized.state.workoutResults
        .find(({ id }) => id === "result-2026-08-26-threshold")
        ?.laps.find(({ id }) => id === "lap-threshold-rep-1"),
    ).toMatchObject({ maximumHeartRateBpm: 175 });
  });

  it.each(INVALID_SAVED_CASES)(
    "replaces %s with the exact fixture and a restrained notice",
    async (savedCase) => {
      const envelope = await fixtureEnvelope();
      const rawByCase = {
        "malformed JSON": "{broken",
        "unsupported schema": JSON.stringify({
          ...envelope,
          schemaVersion: 99,
        }),
        "mismatched seed": JSON.stringify({
          ...envelope,
          seedVersion: "another-seed",
        }),
        "invalid workspace state": JSON.stringify({
          ...envelope,
          state: { seedVersion: "demo-athlete-v1" },
        }),
      };
      const storage = new ControlledStorage();
      storage.setItem(WORKSPACE_STORAGE_KEY, rawByCase[savedCase]);
      const repository = new BrowserWorkspaceRepository(() => storage);
      const source = createDemoCoachingContextSource();

      const initialized = await initializeWorkspace({
        fixtureSource: source,
        repository,
      });

      expect(initialized.state).toEqual(await source.loadContext());
      expect(initialized.notice).toBe(
        "Saved demo data could not be used, so the Training Plan was refreshed.",
      );
      expect(await repository.load()).toEqual({
        schemaVersion: 1,
        seedVersion: "demo-athlete-v1",
        savedAt: "2026-08-26T20:15:00+01:00",
        state: initialized.state,
      });
    },
  );

  it.each(["athlete.profile", "coachingTopics"] as const)(
    "restores the exact fixture when schema-v1 state is missing %s",
    async (missingField) => {
      const envelope = await fixtureEnvelope();
      if (missingField === "athlete.profile") {
        delete (envelope.state.athlete as unknown as Record<string, unknown>)
          .profile;
      } else {
        delete (envelope.state as unknown as Record<string, unknown>)
          .coachingTopics;
      }
      const storage = new ControlledStorage();
      storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));
      const repository = new BrowserWorkspaceRepository(() => storage);
      const source = createDemoCoachingContextSource();

      const initialized = await initializeWorkspace({
        fixtureSource: source,
        repository,
      });

      expect(initialized.state).toEqual(await source.loadContext());
      expect(initialized.notice).toBe(
        "Saved demo data could not be used, so the Training Plan was refreshed.",
      );
    },
  );

  it.each(MALFORMED_STATE_CASES)(
    "replaces a saved workspace with %s",
    async (_case, corrupt) => {
      const envelope = await fixtureEnvelope(4);
      corrupt(envelope.state as unknown as Record<string, any>);
      const storage = new ControlledStorage();
      storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));
      const repository = new BrowserWorkspaceRepository(() => storage);
      const source = createDemoCoachingContextSource();

      const initialized = await initializeWorkspace({
        fixtureSource: source,
        repository,
      });

      expect(initialized.state).toEqual(await source.loadContext());
      expect(initialized.notice).toBe(
        "Saved demo data could not be used, so the Training Plan was refreshed.",
      );
    },
  );

  it.each([
    ["an empty receipt evidence reference", [""]],
    ["an empty receipt evidence list", []],
    [
      "duplicate receipt evidence references",
      ["observation:training-load", "observation:training-load"],
    ],
  ])("refreshes persisted state containing %s", async (_case, evidenceRefs) => {
    const envelope = await approvedEnvelope();
    envelope.state.adaptationReceipts[0].evidenceRefs = evidenceRefs;
    const storage = new ControlledStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));
    const source = createDemoCoachingContextSource();

    const initialized = await initializeWorkspace({
      fixtureSource: source,
      repository: new BrowserWorkspaceRepository(() => storage),
    });

    expect(initialized.state).toEqual(await source.loadContext());
    expect(initialized.notice).toContain("could not be used");
  });

  it.each([
    [
      "an unsupported receipt-root rationale",
      (receipt: AppliedPlanAdaptation) => {
        Object.assign(receipt, { rationale: "discarded explanation" });
      },
    ],
    [
      "an unsupported selected-option field",
      (receipt: AppliedPlanAdaptation) => {
        Object.assign(receipt.selectedOption, {
          rationale: "discarded explanation",
        });
      },
    ],
    [
      "an unsupported affected-workout field",
      (receipt: AppliedPlanAdaptation) => {
        Object.assign(receipt.affectedWorkouts[0], { note: "discarded note" });
      },
    ],
    [
      "an unsupported before-workout field",
      (receipt: AppliedPlanAdaptation) => {
        Object.assign(receipt.affectedWorkouts[0].before!, {
          rationale: "discarded explanation",
        });
      },
    ],
    [
      "an unsupported after-workout field",
      (receipt: AppliedPlanAdaptation) => {
        Object.assign(receipt.affectedWorkouts[1].after!, {
          rationale: "discarded explanation",
        });
      },
    ],
  ] as const)(
    "restores the exact fixture when saved data contains %s",
    async (_case, corrupt) => {
      const envelope = await approvedEnvelope();
      corrupt(envelope.state.adaptationReceipts[0]);
      const storage = new ControlledStorage();
      storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));
      const source = createDemoCoachingContextSource();

      const initialized = await initializeWorkspace({
        fixtureSource: source,
        repository: new BrowserWorkspaceRepository(() => storage),
      });

      expect(initialized.state).toEqual(await source.loadContext());
      expect(initialized.notice).toBe(
        "Saved demo data could not be used, so the Training Plan was refreshed.",
      );
    },
  );
});
