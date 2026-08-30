# COROS data granularity for the planned visualizations

**Question:** What data granularity can the Athlete's COROS ecosystem provide for each planned visualization, and through which export or API path?

**Research date:** 2026-08-30

**Scope:** Representative authenticated COROS MCP reads for the connected Athlete account, plus current COROS first-party documentation. This note records data prerequisites for the design work; it does not select a production stack or establish a production integration entitlement.

## Decision

The dashboard can support the readiness, per-Workout Result summary, weekly volume, training-load, and pace-versus-heart-rate visualizations from authenticated COROS MCP data, provided every readiness series is gap-tolerant and every value retains its source date. A pushed Workout Result detail screen can show per-lap pace and heart rate for an individual Workout Result.

Repeated-session comparison is **not yet a fully supported basic-query prerequisite**. The connector exposes lap rows for an individual Workout Result, but COROS documents that split-by-split comparison across workouts requires requesting the raw `.FIT` files first. The representative `downloadActivityFitFiles` call in this runtime failed with `Unexpected response type`; therefore the comparison visualization must remain conditional on a working FIT ingestion path or an explicitly validated lap-normalization adapter.

## Granularity decision by planned visualization

| Planned visualization / surface | Required data | Verified COROS granularity | Source path and practical freshness | Decision |
| --- | --- | --- | --- | --- |
| **Readiness trends** (HRV, resting heart rate, sleep duration/stages) | Daily values with honest gaps | `querySleepHrv` returns wake-up-day assessments and overnight samples; `queryRestingHeartRate` returns daily values and explicit `No data`; `querySleepData` returns main-sleep duration and stage ratios when present | Authenticated MCP read after the watch/app sync. COROS documents that Overnight HRV is measured during sleep in 10-minute intervals and requires wearing the watch; there is no vendor freshness SLA in the reviewed sources. | **Supported with gaps.** Render missing values as missing, never as zero or interpolated readiness. The source dates are wake-up days. |
| **Weekly volume and training-load progression** | Per-Workout Result distance, duration, and load | `getActivityDetail` returns distance, Workout Time, average pace/HR, and Training Load. Three representative Workout Results returned loads 101, 31, and 67; their distance total is 25.84 km and Workout Time total is 2:27:48 | MCP per-Workout Result reads. COROS's activity summary documents distance, time, Training Load, and other statistics. `queryTrainingLoadAssessment` returned `Unknown` with zero short-/long-term load in this sample, so it is not the authoritative series for this decision. | **Supported from Workout Results.** Aggregate per-Workout Result values; treat an `Unknown` aggregate assessment as unavailable, not zero. |
| **Pace-versus-heart-rate aerobic-efficiency trend** | Comparable Workout Result pace and average HR over time | The activity-record and detail calls return average pace and average HR for each of the three recent Outdoor Runs; a derived chart can plot those pairs | MCP activity/detail reads after sync. COROS activity pages expose pace/speed and heart-rate graphs. No direct COROS field named “aerobic efficiency” was returned. | **Supported as a derived comparison.** Label it as a derived pace/HR trend and compare like-for-like Workout Results; do not imply a native COROS efficiency score. |
| **Repeated-session comparison** (Pane 2) | Comparable split/lap pace and HR across two or more Workout Results | `queryActivityLapData` exposes lap-group rows with `avgPace`, `avgHr`, and `maxHr` for one Workout Result, including 1 km and 5 km groups in the representative 5.64 km run. COROS says cross-workout split analysis needs raw FIT files. | Individual lap query works through MCP. Manual `.FIT` export is documented; the MCP FIT download call failed in this runtime. | **Flagged prerequisite / conditional.** Do not promise automatic cross-workout split comparison until FIT retrieval and normalization are verified. |
| **Workout detail pushed screen** | Per-lap pace and HR within one Workout Result | `queryActivityLapData` returns lap rows and columns for `avgPace`, `avgHr`, `maxHr`; the sample includes multiple distance groups and per-lap values | MCP activity detail/lap calls; manual FIT export is a fallback. The COROS app also exposes an expanded lap table. | **Supported.** Keep this as a pushed detail screen as already decided in the map. |
| **Today pane: race countdown, today's Planned Workout, 7-day week strip** | Training Plan, Target Race, and Planned Workout state | Not COROS prerequisites in this issue; these are application Training Plan records | Application-owned and not established by COROS evidence here. | **Unaffected by this COROS decision.** |
| **Coaching pane: Athlete Feedback, Workout Adaptations, and Feedback → Adaptations → Workout Results timeline** | Athlete Feedback, Plan/Workout Adaptation receipts, and linked Workout Results | COROS supplies the Workout Result side only; the other records are application domain records | Application-owned records, with COROS reads used as Coaching Evidence where linked. | **Unaffected by this COROS decision.** |

## Representative authenticated MCP evidence

The following reads were made against the connected COROS MCP on 2026-08-30. Tool arguments are included so the evidence can be reproduced without exposing authentication material.

### Activity records and Workout Result summaries

`querySportRecords` with:

```json
{
  "startDate": "20260824",
  "endDate": "20260830",
  "limit": 20,
  "locationKeyword": "",
  "maxAveragePace": "",
  "maxDistanceKm": 0,
  "maxDurationMinutes": 0,
  "minDistanceKm": 0,
  "minDurationMinutes": 0,
  "sportTypeCodes": [65535]
}
```

Returned three Outdoor Run records:

- 2026-08-28: 12.00 km, 1:05:55, average pace 5:30/km, average HR 145 bpm, 641 kcal, `labelId=479946799054881067`.
- 2026-08-26: 5.64 km, 35:43, average pace 6:20/km, average HR 130 bpm, 283 kcal, `labelId=479900614466240515`.
- 2026-08-25: 8.20 km, 46:10, average pace 5:38/km, average HR 142 bpm, 423 kcal, `labelId=479877358292074799`.

`getActivityDetail` returned the following representative fields:

| Workout Result | Workout Time | Distance | Average pace | Average HR | Training Load | Other returned signals |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-08-28, `479946799054881067` | 1:05:55 | 12.00 km | 5:30/km | 145 bpm | 101 | Moving pace 5:22/km; adjusted pace 5:28/km; focus Threshold |
| 2026-08-26, `479900614466240515` | 35:43 | 5.64 km | 6:20/km | 130 bpm | 31 | Moving pace 6:14/km; adjusted pace 6:20/km; focus Recovery |
| 2026-08-25, `479877358292074799` | 46:10 | 8.20 km | 5:38/km | 142 bpm | 67 | Moving pace 5:27/km; adjusted pace 5:37/km; focus VO2 Max |

`queryTrainingLoadAssessment` with `{ "days": 7 }` returned `Comment: Unknown`, `Short-Term Load: 0`, and `Long-Term Load: 0` for 2026-08-25 through 2026-08-30. The decision therefore uses the per-Workout Result `Training Load` values for the weekly progression prerequisite and preserves the aggregate assessment as unavailable in this sample.

### Per-lap pace and heart rate

`queryActivityLapData` with `{ "labelId": "479900614466240515", "sportType": 100 }` returned `columns` containing `avgPace`, `avgHr`, and `maxHr`, plus multiple lap groups. The normalized 1 km group contained five 1.000 km laps and a 0.64037 km final lap. Examples were:

- lap 1: 6:33.87/km, average HR 133 bpm;
- lap 4: 6:09.87/km, average HR 131 bpm;
- final lap: 6:00.15/km, average HR 126 bpm.

The same result also contained a 5 km group and a whole-activity group. The whole-activity row had `avgHr=130` but no `avgPace` field, which is a concrete reason for the adapter to prefer the appropriate lap group rather than assuming every aggregate row has every metric.

### HRV, resting heart rate, sleep, and missing nights

`queryRestingHeartRate` with `{ "days": 7 }` returned:

```text
2026-08-30: 53 bpm
2026-08-29: 53 bpm
2026-08-28: 52 bpm
2026-08-27: No data
2026-08-26: No data
2026-08-25: No data
2026-08-24: 62 bpm
```

`querySleepHrv` with `{ "days": 7, "startDate": "20260824", "endDate": "20260830" }` stated that dates are wake-up days. Its assessment section returned HRV averages of 96 ms on 2026-08-28, 105 ms on 2026-08-29, and 107 ms on 2026-08-30. The time-series section had samples on 2026-08-24, 2026-08-25, 2026-08-28, 2026-08-29, and 2026-08-30, with no HRV samples for 2026-08-26 or 2026-08-27.

`querySleepData` with `{ "days": 7, "startDate": "20260824", "endDate": "20260830" }` returned only `Naps Total: 0 min` for 2026-08-24 through 2026-08-27; those date blocks contained no main-sleep duration or stage fields. This is the source-level missing-night shape observed in the connected account: the date may be present, but the sleep metrics are absent. It must not be converted into zero hours of sleep. The populated nights were:

| Wake-up day | Main sleep | Deep | Light | REM | Awake | Sleep score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-08-28 | 3h 10min | 16% | 70% | 10% | 4% / 7 min | 41 |
| 2026-08-29 | 6h 37min | 24% | 46% | 29% | 1% / 6 min | 95 |
| 2026-08-30 | 8h 42min | 16% | 54% | 27% | 3% / 16 min | 92 |

### Export and freshness call

The discovered `downloadActivityFitFiles` tool was called once with `{ "labelId": "479946799054881067", "sportType": 100, "limit": 1 }`. It failed with the exact connector error `Unexpected response type`. This is a runtime limitation of the current MCP file response path, not evidence that COROS does not support FIT export; the official COROS documentation below verifies manual FIT export and the official MCP guide documents FIT-file access with a 50-file-per-calendar-day cap.

No MCP response in this audit included a source `fetchedAt`, sync-completed timestamp, or freshness SLA. The practical freshness boundary is therefore the last successful watch-to-app/account sync. Store and display the dashboard's own last successful read time, and treat an absent or stale source read as unknown rather than fabricating a current value.

## Verified first-party facts

These are documented facts, separate from the recommendations above:

- COROS's [MCP guide](https://support.coros.com/hc/en-us/articles/50841795180948-COROS-MCP-A-Guide-to-Connecting-Your-Training-Data-to-AI) lists activity records, lap and segment data, FIT files, daily health data, sleep, HRV, and resting heart rate as queryable categories. It also says FIT requests are capped at 50 files per calendar day and that cross-workout split-by-split analysis requires raw FIT files.
- The [activity summary guide](https://support.coros.com/hc/en-us/articles/15284799576980-Activities-Page-Activity-Summary) documents pace/speed and heart-rate graphs, expanded lap details, distance-auto laps, structured-workout phases, and activity statistics including distance, time, and Training Load. It documents per-activity export as FIT, GPX, or another available file type.
- The [manual activity export guide](https://support.coros.com/hc/en-us/articles/4408620041620-Manually-Import-Export-an-Activity-to-3rd-Party-Sites) gives the path Activities → saved activity → three dots → Export Data → `.FIT`.
- The [bulk historical export guide](https://support.coros.com/hc/en-us/articles/33125636125204-Bulk-Export-Historical-Activity-Data) documents Training Hub → Activity List → Export Data, with `.FIT` or `.TCX` delivered by email. The [bulk export request guide](https://support.coros.com/hc/en-us/articles/25002333092500-Requesting-a-Bulk-Export-of-COROS-Data) separately documents requesting non-activity data such as daily metrics, sleep, and heart rate from COROS Support with a specified date range.
- COROS's [workout export/integration guide](https://support.coros.com/hc/en-us/articles/360043975752-Exporting-Workout-Data-and-Uploading-to-3rd-Party-Apps) says newly recorded workout data is pushed to linked third-party platforms when the watch syncs with the COROS app, while daily data is not supported for third-party integration or export. It recommends `.FIT` when heart rate matters and says daily HR and steps cannot currently be exported through that path.
- The [workout sync guide](https://support.coros.com/hc/en-us/articles/360039934532-Syncing-Workouts-to-the-App) says a finished workout syncs automatically when Bluetooth is established and gives manual Progress-page pull-to-refresh steps when data is not current.
- The [Overnight HRV guide](https://support.coros.com/hc/en-us/articles/20959044334612-Overnight-HRV) says HRV is measured when the watch is worn to sleep, uses 10-minute overnight intervals, and needs five nights to establish a baseline assessment. The [sleep tracking guide](https://support.coros.com/hc/en-us/articles/360042390872-How-COROS-Watches-Track-Sleep) says the first recorded sleep over three hours receives a full assessment and that accurate tracking depends on wearing the watch. The [sleep stages guide](https://support.coros.com/hc/en-us/articles/6168301732372-What-Are-Sleep-Cycles-and-Stages-of-Sleep) documents Awake, Light, Deep/SWS, and REM, with device-specific limitations.
- The [COROS API application guide](https://support.coros.com/hc/en-us/articles/17085887816340-Submit-an-API-Application) documents a standard OAuth 2.0 framework, developer onboarding, redirect URIs, terms, and issued API credentials. This is a fact about future/official API access, not a production-stack decision for this repository.

## Implementation implications

These are recommendations derived from the facts and representative payloads:

1. Keep `Workout Result` as the provenance-bearing record for activity metrics. Do not collapse it into the generic term “activity” in the domain-facing documentation.
2. Model readiness values as optional observations keyed by the COROS wake-up day and source metric. Preserve explicit `No data` and absent sleep metric fields as gaps.
3. Sum distance, Workout Time, and per-Workout Result Training Load for the weekly visualization only when the underlying Workout Results are present. Do not treat `Unknown`/zero aggregate load as a confirmed zero-load week.
4. Treat pace-versus-heart-rate as a derived visualization with comparison filters, not as a native “aerobic efficiency” metric returned by COROS.
5. Keep repeated-session comparison behind a verified FIT ingestion/normalization seam. The single-Workout Result lap query is enough for the pushed detail screen, but not enough evidence for a portable cross-Workout Result comparison.
6. Use manual `.FIT` export or COROS support bulk export as a research/backfill path. The MCP file tool needs a response-handling fix or verification before it can be the sole path for raw-file analysis.

