/**
 * Submission-only presentation fixtures for the Coaching notebook UI.
 * These records are deliberately not authoritative workspace state and are not
 * persisted or exposed to Coach Agent tools.
 */
export interface CoachingNotebookReview {
  id: string;
  weekStart: string;
  weekEnd: string;
  recordedAt: string;
  headline: string;
  assessment: string;
  progress: string[];
  watch: string[];
  nextFocus: string[];
  evidenceRefs: string[];
}

export interface SeededAdaptationHistoryEntry {
  id: string;
  label: string;
  appliedAt: string;
  affectedWorkoutCount: number;
  planVersionBefore: number;
  planVersionAfter: number;
  evidenceRefs: string[];
}

export const DEMO_WEEKLY_PROGRESS_REVIEWS: CoachingNotebookReview[] = [
  {
    id: "weekly-review-2026-08-23",
    weekStart: "2026-08-17",
    weekEnd: "2026-08-23",
    recordedAt: "2026-08-24T08:15:00+01:00",
    headline: "Strong long-run consistency, with one signal to watch",
    assessment:
      "The week extended Sam's aerobic durability without disrupting the overall training rhythm. The mild right-shin soreness reported late in Sunday's long run is the only reason not to progress automatically.",
    progress: [
      "Completed the planned 20 km long run after a consistent four-run week.",
      "Held the steady session and easy mileage without a broader recovery decline.",
    ],
    watch: [
      "Mild right-shin soreness appeared near the end of the long run and needs a fresh report after the next run.",
    ],
    nextFocus: [
      "Keep the next quality session controlled and reassess the shin before adding load.",
    ],
    evidenceRefs: [
      "workout-result:result-2026-08-23",
      "athlete-feedback:athlete-feedback:seed-shin-discomfort",
      "observation:training-load",
    ],
  },
  {
    id: "weekly-review-2026-08-16",
    weekStart: "2026-08-10",
    weekEnd: "2026-08-16",
    recordedAt: "2026-08-17T08:10:00+01:00",
    headline: "Aerobic rhythm is settling in",
    assessment:
      "The controlled threshold session held pace without excessive heart-rate drift, while the 18 km long run extended time on feet. Recovery evidence supported continuing the build without an extra cutback.",
    progress: [
      "Completed all five 1 km threshold repetitions between 4:36 and 4:39 per kilometre.",
      "Completed the 18 km long run and supporting aerobic running.",
    ],
    watch: [],
    nextFocus: ["Carry the same restraint into the first steady session."],
    evidenceRefs: [
      "workout-result:result-2026-08-16",
      "workout-result:result-2026-08-13-threshold",
      "observation:recovery",
    ],
  },
  {
    id: "weekly-review-2026-08-09",
    weekStart: "2026-08-03",
    weekEnd: "2026-08-09",
    recordedAt: "2026-08-10T08:05:00+01:00",
    headline: "A measured start to the build",
    assessment:
      "The opening week established a useful threshold benchmark while leaving enough space around it for easy running. The priority remains consistency, not early volume chasing.",
    progress: ["Established a controlled threshold reference for the build."],
    watch: ["Keep the early load increase gradual while the routine settles."],
    nextFocus: ["Extend the long run while protecting easy-day intensity."],
    evidenceRefs: [
      "workout-result:result-2026-08-06-threshold",
      "observation:training-load",
    ],
  },
];

export const DEMO_ADAPTATION_HISTORY: SeededAdaptationHistoryEntry[] = [
  {
    id: "seeded-adaptation-recovery-window",
    label: "Protect the long-run recovery window",
    appliedAt: "2026-08-17T08:20:00+01:00",
    affectedWorkoutCount: 2,
    planVersionBefore: 0,
    planVersionAfter: 1,
    evidenceRefs: ["workout-result:result-2026-08-16", "observation:recovery"],
  },
];
