# Plan Generator Logic Reference

This document describes the current Run.B*tch.app initial plan generator as of
Milestone 13 Step 1. It is written for external review and third-party analysis. It
describes the deterministic rule engine, its data flow, assumptions, safety
rules, known limits, and app contracts.

The generator is treated as feature-complete for the current product state. It
is not an AI generator. It is a deterministic, TypeScript rule engine designed
to preserve the existing app loop:

```text
Profile -> Race goal -> Generate plan -> View/export workouts -> Log workouts -> Score -> Adjust future plan
```

## Source Files

Core generation files:

- `/lib/training/planGenerator.ts`: public generator entrypoint, input
  normalization, phase/load planning, weekly layout, safety enforcement,
  output rows, and persisted metadata.
- `/lib/training/trainingEvidence.ts`: six-week history and fitness evidence
  analyzer.
- `/lib/training/workoutLibrary.ts`: internal workout subtype library,
  variable-based prescription resolver, structured workout builder.
- `/lib/training/physiology.ts`: optional advanced physiology inputs, HR/power
  target derivation, and physiology-based effort classification helpers.
- `/lib/training/loadRisk.ts`: intensity-bucket mapping, weekly intensity
  summaries, cap flags, and whole-plan intensity summaries.
- `/lib/training/planGenerationHistory.ts`: 42-day history-window assembly from
  app logs, Strava-imported logs, and manual fallback.
- `/lib/strava/activityEvidence.ts`: Strava detail/stream evidence adapter for
  pace fade, HR drift, power/elevation availability, achievements, PR signals,
  workout markers, and effort hints.
- `/app/api/training-plans/generate/route.ts`: server route that assembles
  history, handles Strava history enrichment/import, evaluates unrealistic
  goals, saves the plan, and returns warnings/history audit data.

Primary tests:

- `/tests/planGenerator.test.mjs`: focused generator behavior tests.
- `/tests/planGeneratorConformance.test.mjs`: Milestone 12L spec-conformance
  matrix and regression harness.
- `/tests/workoutLibrary.test.mjs`: subtype mapping, prescription variables,
  and structured workout safety.
- `/tests/planGeneratorConformance.test.mjs`: also verifies physiology target
  additions keep structured exports pace-safe.
- `/tests/loadRisk.test.mjs`: intensity bucket and summary helpers.
- `/tests/trainingEvidence.test.mjs`: evidence analyzer behavior.
- `/tests/stravaActivityEvidence.test.mjs`: Strava detail/stream evidence.

## Public Contract

The generator keeps the existing public API:

```ts
generateTrainingPlan(profile, raceGoal, options)
```

Supported goals:

- `marathon`
- `half_marathon`

Unsupported race distances throw an error.

The generated output keeps the current app contracts:

- `training_plans` shape is preserved.
- `planned_workouts` shape is preserved.
- persisted `workout_type` values remain DB-safe.
- structured workouts use `StructuredWorkout.version = 1`.
- generated run workouts have pace targets where possible.
- optional HR and power targets supplement row metadata and instructions while
  pace remains the export-safe primary structured target.
- rest, strength, and cross-training rows do not create run structured workout
  documents.
- Garmin, Intervals.icu, manual logging, scoring, deletion, and adjustment
  integrations keep using the same stored workout fields.

## High-Level Pipeline

The generator follows this sequence:

1. Validate race distance and dates.
2. Normalize current app inputs into internal profiles.
3. Analyze six-week training history and Strava evidence.
4. Derive fitness, load, durability, feasibility, and pace metrics.
5. Build phase and weekly load targets.
6. Select weekly run days and workout subtypes.
7. Resolve each subtype into variable-based workout prescriptions.
8. Enforce intensity caps, gray-zone limits, and load-stacking rules.
9. Re-resolve softened workouts.
10. Build `planned_workouts` rows and structured workouts.
11. Build persisted generation metadata.
12. Return warnings, assumptions, plan rows, and workout rows.

## Server Route Flow

Plan creation is server-side through:

```text
POST /api/training-plans/generate
```

The route:

- authenticates the user;
- loads the active profile and race goal;
- checks whether an active plan already exists and asks for confirmation before
  replacing it;
- builds a 42-day history window;
- queries app `logged_workouts` first;
- in auto mode, checks Strava after replacement confirmation even when app logs
  already cover all six weeks;
- if Strava is connected, fetches eligible Strava runs from the last 42 days;
- fetches Strava detail and stream evidence for eligible six-week run
  activities where available;
- merges app logs and Strava evidence into one canonical six-week evidence set;
- imports non-duplicate valid Strava runs as unlinked history logs
  (`training_plan_id = null`, `planned_workout_id = null`);
- stores Strava audit rows and enriched raw/evidence JSON without overwriting
  linked workout IDs;
- skips duplicates, non-runs, invalid runs, and activities outside the window;
- preserves app log identity, planned-workout linkage, notes, and RPE when a
  Strava activity matches an existing app log, while attaching Strava
  detail/stream evidence for generation;
- if Strava is not connected and history is incomplete, asks for Strava or
  manual history;
- uses manual six-week history stored on the profile only for weeks still
  uncovered after app and Strava evidence are merged;
- evaluates whether the requested goal is not credible before saving;
- if the goal is not credible, returns a suggested replacement and waits for
  confirmation;
- on confirmation, recomputes the suggested goal server-side and generates with
  that target without editing the saved race goal row;
- saves the plan and workouts only after confirmation rules pass.

## Normalized Internal Model

The current `Profile` and `RaceGoal` rows are adapted into internal structures.

### Goal Profile

Fields:

- race type: marathon or half marathon;
- race date;
- target finish time, if any;
- race priority: `A`, `B`, or `casual`;
- goal flexibility: `fixed`, `flexible`, or `finish_only`;
- plan mode: `relaxed`, `moderate`, `aggressive`, or `very_aggressive`.

Legacy mappings:

- `conservative` maps to `relaxed`;
- `balanced` maps to `moderate`;
- `finish` target priority maps to finish/flexible behavior;
- `personal_best` maps to B/flexible behavior;
- `aggressive` maps to A/fixed behavior when a target time exists.

### Availability Profile

Fields:

- selected running days per week;
- saved available training days;
- preferred long-run day;
- preferred rest day;
- preferred workout days;
- max weekday session duration;
- max weekend session duration;
- cross-training availability;
- double-run willingness.

Rules:

- available training days are sorted in week order;
- if available days are missing, a fallback layout is used;
- if fewer available days exist than requested running days, saved available
  days are used instead of compressing extra stress;
- preferred rest day is avoided when enough alternatives exist;
- preferred long-run day is the strongest schedule anchor;
- preferred workout days are used for quality work only when spacing remains
  safe;
- unsafe preferred workout days are ignored and recorded as an assumption;
- true double-run days are not scheduled because the current schema supports
  one planned workout per date;
- double-run willingness is only a small capacity signal for supported
  advanced runners.

Fallback running-day layouts:

| Runs/week | Fallback days |
|---:|---|
| 2 | Tuesday, Saturday |
| 3 | Tuesday, Thursday, Saturday |
| 4 | Monday, Wednesday, Friday, Saturday |
| 5 | Monday, Tuesday, Wednesday, Friday, Saturday |
| 6 | Monday, Tuesday, Wednesday, Thursday, Friday, Saturday |

### Athlete Profile

Fields:

- age, derived from birth year and plan start date;
- sex;
- height and weight;
- easy pace;
- threshold pace;
- lactate-threshold HR;
- aerobic-threshold HR and pace;
- manual/lab/Garmin/other HR zones;
- threshold power, critical power, easy power range, and power zones;
- VO2max and source;
- running experience level;
- injury signal.

Rules:

- sex is not used as a crude performance limiter;
- height and weight are not used to estimate performance;
- body data is used only as a load-tolerance modifier in clear cases:
  - BMI >= 30 plus low base or beginner history;
  - BMI >= 27 plus very low current base;
  - BMI < 18.5 plus aggressive loading;
- age >= 45 mildly reduces progression/hard-session exposure;
- age >= 55 is a stronger recovery signal;
- beginner experience reduces start load, peak load, progression, and hard
  workout eligibility;
- current pain or serious recent injury blocks aggressive/very aggressive mode
  and changes the generated mode to relaxed.
- explicit saved HR zones are preferred over threshold HR, HR reserve, and
  max-HR percentage fallbacks for HR targets and effort classification;
- lactate-threshold HR can derive recovery/easy/steady/threshold/interval/race
  HR target ranges;
- aerobic-threshold HR helps easy and steady target ranges and can identify
  controlled aerobic-threshold efforts when stronger HR data is unavailable;
- saved resting HR plus max HR enables HR-reserve targets when no stronger zone
  inputs exist;
- saved power zones or threshold/critical power derive optional power target
  guidance;
- VO2max is stored as context for later readiness work, but by itself it does
  not make an aggressive goal credible or override pace/history evidence.

### Environment Profile

Fields:

- terrain available: flat, hills, track, treadmill, trails, downhill;
- typical surface/elevation context;
- race-course profile: flat, rolling, hilly, mountainous, unknown;
- course notes;
- expected weather notes.

Derived signals:

- flat route available;
- hills available;
- treadmill available;
- trail access;
- race course looks flat;
- race course looks rolling/hilly;
- weather caution;
- effort-target bias.

Weather caution is note-based. It looks for heat, humidity, wind, cold, rain,
or exposure signals and strengthens effort/HR wording. It does not model
forecast conditions.

## Six-Week History Evidence

The evidence layer prefers detailed recent history but supports fallbacks.

History source priority:

1. app logged workouts from the last 42 days;
2. Strava history evidence from the full 42-day window when connected;
3. canonical app + Strava merge with duplicate-safe imports only for missing
   activities;
4. manual six-week history stored on the profile for still-uncovered weeks;
5. self-reported profile fields;
6. conservative fallback estimates.

The analyzer uses exactly six weekly summaries when available. A week counts as
covered when it has at least one run.

App/Strava duplicates are matched by exact Strava activity ID, same date plus
similar distance or duration, or a same-date linked app log that matches the
Strava run. Matching uses a distance tolerance of `max(0.2 km, 3%)` and a
duration tolerance of `max(180 sec, 5%)`. When a duplicate is found, app identity
and planned-workout linkage win; Strava detail, streams, HR/power, pace fade,
HR drift, elevation, achievements, splits, and PR signals enrich the in-memory
history evidence and audit JSON.

Computed load metrics:

- average weekly km;
- average weekly time;
- median weekly km;
- maximum weekly km;
- minimum nonzero weekly km;
- runs per week;
- completed weeks out of six;
- load consistency (`completedWeeks / 6`);
- recent ramp (`last two week average / first four week average`);
- longest run distance;
- longest run duration;
- maximum long-run share of weekly volume.

Fallbacks:

- if current weekly mileage is present, it becomes the fallback six-week
  average;
- if current weekly mileage is missing, the fallback is 24 km/week for
  marathon and 16 km/week for half marathon;
- if longest recent run is missing, it is estimated from current weekly
  mileage with conservative clamps;
- missing history lowers confidence and adds warnings.

## Strava Evidence

For eligible six-week Strava runs, the history path can fetch:

- detailed activity data with efforts, splits, laps, achievements, workout
  type, perceived exertion if present, speed, HR, power, and raw detail;
- streams for time, distance, heart rate, watts, smoothed velocity, altitude,
  grade, cadence, and moving.

Missing detail or streams do not fail generation. The route falls back to
summary-only evidence and records warnings.

The Strava adapter extracts:

- whether detail and streams are available;
- HR stream availability;
- power availability;
- activity date, distance, duration, average pace, HR, and power values when
  available;
- achievement count;
- best-effort count;
- PR count;
- perceived exertion;
- Strava workout type;
- split/lap pace variation;
- sustained hard section count;
- pace fade percent;
- negative split signal;
- heart-rate drift percent;
- elevation gain;
- altitude range;
- grade range;
- compact effort signals;
- classification hint.

Classification hints:

- `race_time_trial`
- `possible_near_max`
- `hard_workout`
- `controlled`
- `easy_non_limit`

Fastest Strava activity rule:

The fastest recent Strava run is not used as a max fitness anchor unless
effort evidence supports race/time-trial or near-max classification. A fast run
with easy or summary-only evidence remains non-limit evidence.

## Effort Classification

Logged workouts are classified into:

- `easy_non_limit`
- `controlled`
- `hard_workout`
- `possible_near_max`
- `race_time_trial`

Inputs used:

- RPE;
- average HR and max HR using this priority: explicit HR zones, lactate-threshold
  HR, HR reserve, max HR, then aerobic-threshold HR;
- Strava run-power values against saved power zones or threshold/critical power;
- pace relative to saved easy pace;
- workout notes;
- Strava evidence hints and effort signals.

Rules:

- race/time-trial requires a race/time-trial note/name/marker plus strong
  effort evidence, or explicit Strava race/time-trial support;
- possible near-max requires very high RPE, HR, near-max notes, or Strava
  near-max support;
- hard workout uses RPE >= 7, high physiology-derived effort, hard-workout
  notes, or Strava hard workout support;
- controlled uses moderate RPE/physiology effort, controlled Strava evidence,
  or faster-than easy pace without easy-non-limit support;
- easy non-limit is the fallback when no hard evidence exists.

## Durability Evidence

Computed durability fields:

- longest run to goal distance ratio;
- longest run to weekly volume ratio;
- long-run duration category;
- durability trend: `unknown`, `stable`, `caution`, or `poor`;
- average pace fade percent;
- average heart-rate drift percent;
- negative split count;
- HR data availability;
- power data availability;
- average weekly elevation gain;
- elevation tolerance.

Elevation tolerance:

- unknown when no elevation evidence exists;
- low, moderate, or high based on average weekly elevation gain.

Durability trend worsens when:

- long-run share is too high;
- pace fade is high;
- heart-rate drift is high;
- longest run is too short relative to goal distance;
- evidence source is weak.

Durability affects:

- current race estimate;
- weekly progression cap;
- initial long run;
- peak long run;
- long-run intensity eligibility;
- hilly terrain eligibility;
- warnings and assumptions.

## Fitness Estimate

Threshold pace source priority:

1. saved threshold pace;
2. recency-weighted race/time-trial, near-max, or hard-workout anchor;
5. easy-pace estimate;
6. missing.

Performance anchors are scored only inside the same 42-day history window used
for plan history. Weekly load, median load, consistency, recent ramp, injury
signals, availability, and terrain access are not recency-weighted.

Anchor scoring uses:

```text
anchor_score =
  effort_quality_score
  × source_quality_score
  × recency_weight
  × data_confidence_score
```

Recency weights:

| Anchor age | Weight |
|---:|---:|
| 0-14 days | 1.00 |
| 15-28 days | 0.85 |
| 29-42 days | 0.70 |

Effort quality keeps race/time-trial evidence strongest, then near-max, then
hard workout. Controlled and easy runs can support fallback pace context but do
not become max anchors just because they are recent.

Anchor conversions:

- race/time-trial pace is converted to threshold with a small slowdown;
- near-max effort receives a larger adjustment;
- hard workout receives a more cautious adjustment;
- easy pace estimates threshold at roughly 88% of easy pace speed;
- if saved easy pace is missing but easy/controlled recent workouts exist,
  median recent easy/controlled pace can support an easy-pace estimate.

Generated plan metadata stores the selected anchor date, classification,
recency bucket, anchor score, and whether recency weighting changed the selected
anchor.

Fitness confidence:

- high: saved threshold or race/time-trial with useful history;
- medium: strong but incomplete anchor evidence or useful easy-pace evidence
  with HR/power/history support;
- low: weak history, easy-only estimate without physiology evidence, or
  missing anchors.

Current race pace estimate:

- starts from threshold pace;
- applies a race-distance multiplier:
  - marathon uses a larger slowdown than half marathon;
  - half marathon can use shorter anchors more readily;
- applies durability penalties;
- applies frequency penalties;
- applies threshold-source penalties;
- penalizes short effort anchors more for marathon than half marathon;
- penalizes weak confidence;
- penalizes poor/cautious durability.

## Goal Feasibility

If no target time exists or the goal is finish-only, feasibility is
`finish_only`.

For target-time goals, improvement is measured as:

```text
(currentRacePace - goalRacePace) / currentRacePace
```

Ratings:

| Improvement required | Rating |
|---:|---|
| <= 3% | realistic |
| <= 7% | ambitious |
| <= 12% | very_ambitious |
| <= 18% | low_confidence |
| > 18% | not_credible |

Not-credible target behavior:

- the API returns no saved plan;
- it asks for confirmation;
- it returns a suggested target;
- the client does not send a trusted replacement time;
- on confirmation, the server recomputes the suggestion and generates with it;
- the saved race goal row is not edited;
- the generated plan records the adjusted target decision in assumptions and
  warnings.

Suggested target caps:

- weak confidence, low base, poor durability, injury signal, low consistency,
  or low frequency cap the suggestion around the realistic edge;
- stronger but not ideal evidence can suggest an ambitious edge;
- high-confidence, well-supported evidence can suggest the edge of very
  ambitious.

## Load Categories And Progression

Volume category depends on race distance and recent average weekly km.

Marathon categories:

- low base: < 25 km/week;
- developing: < 40;
- intermediate: < 60;
- strong hobby: < 80;
- advanced hobby: >= 80.

Half-marathon categories:

- low base: < 15 km/week;
- developing: < 30;
- intermediate: < 45;
- strong hobby: < 65;
- advanced hobby: >= 65.

Frequency category:

- <= 3 days: minimal;
- 4 days: basic structured;
- 5 days: standard performance;
- 6 days: advanced hobby.

Start load:

- based on six-week average;
- reduced by inconsistent history, high recent ramp, injury signal, beginner
  status, and body-load caution;
- raised slightly for aggressive modes only when supported;
- minimum start load is 16 km/week for marathon and 10 km/week for half
  marathon.

Peak load:

- selected from race-distance, recent-volume, and plan-mode ranges;
- capped by realistic average session capacity;
- adjusted by age, injury, experience, body-load signal, and double-run
  willingness;
- limited by saved max weekday/weekend session durations when present.

Weekly increase cap:

- depends on volume category and plan mode;
- tightened for low consistency;
- tightened for poor/cautious durability;
- tightened for current/serious injury;
- tightened for beginners;
- tightened for older athletes;
- tightened for body-load caution.

Cutback interval:

- relaxed plans cut back more often;
- aggressive plans cut back less often;
- injury, beginner status, and age >= 55 shorten the interval;
- interval is never below two weeks.

Taper:

- half marathon generally uses one or two taper weeks;
- marathon generally uses two or three taper weeks;
- aggressive, strong, advanced, or injury-signal marathon plans get the longer
  taper when weeks allow.

## Phase Structure

Phase labels:

- `base`
- `build`
- `specific`
- `peak`
- `taper`
- `race_prep`

Rules:

- very short timelines become race-prep plans instead of full development
  builds;
- marathon plans with enough weeks split into base/build/specific/peak/taper;
- half-marathon plans use similar phases with shorter minimum development
  windows;
- the final build week before taper is marked peak;
- taper weeks reduce volume;
- race week contains race distance on race day.

## Long-Run Rules

Peak long run:

- selected from race-distance and volume-category ranges;
- capped by long-run share of peak volume;
- capped by race-distance duration limits;
- capped by saved weekend/long-run-day max duration if present;
- reduced when durability trend is poor.

Initial long run:

- starts from recent longest run;
- capped by a mode/category increase multiplier;
- capped by long-run share of start load;
- capped by peak long run;
- reduced for poor or cautious durability.

Weekly long run:

- progresses toward peak through build/specific phases;
- is share-limited by weekly volume;
- has maximum week-over-week increase rules;
- is reduced in cutback weeks;
- is reduced in taper weeks;
- race week uses race distance.

Long-run intensity:

- easy long run is the default;
- steady finish can appear in supported build/specific weeks;
- race-pace blocks appear only when frequency, phase, durability, confidence,
  volume category, injury status, and feasibility support them;
- cutback, taper, race-prep, injury, high ramp, or weak durability force easy
  long runs.

## Weekly Layout Rules

Each date between plan start and race day receives one row.

Base assignment:

- selected run days become run rows;
- non-run days become rest rows;
- race day is included even if it is not on a selected run day;
- long run is placed on the preferred long-run day when possible;
- race day overrides normal long-run placement.

Quality work:

- no quality work when weekly run count is too low, cutback week, or taper;
- one primary quality session is selected when supported;
- quality days must keep safe spacing from the long run;
- interval work requires a larger gap before the long run;
- preferred workout days are honored only if spacing remains safe.

Second stimulus:

- only for 6-day aggressive/very aggressive plans;
- only in specific or peak phase;
- not for low base, beginners, older high-risk profiles, low confidence, or
  body-load caution;
- still subject to spacing and later risk enforcement.

Medium-long runs:

- only for 5-6 day plans;
- not during taper or race prep;
- placed midweek when a safe easy slot exists;
- steady variant requires non-low confidence and non-beginner profile.

Recovery runs:

- used on the earliest run day in 5-6 day weeks when that slot is easy.

Strides:

- available for 4+ day plans outside taper/race prep;
- placed at least two days before the long run;
- hill strides appear only when hill exposure support exists on eligible
  weeks;
- otherwise easy strides are used.

Optional support:

- optional strength or cross-training can be placed on suitable rest days every
  fourth week;
- never during taper or race week;
- not adjacent to hard/long/race stress;
- cross-training appears only when the profile says it is available;
- support rows have no run structured workout.

## Workout Subtypes

Internal subtypes are not persisted as database enum values. They are mapped
back to DB-safe `workout_type` values and expressed through title,
description, purpose, instructions, terrain, targets, and structured workout.

| Internal subtype | Persisted workout type |
|---|---|
| `rest` | `rest` |
| `strength_optional` | `strength_optional` |
| `cross_training_optional` | `cross_training` |
| `easy_base` | `easy` |
| `easy_strides` | `easy` |
| `recovery` | `recovery` |
| `steady_aerobic` | `easy` |
| `medium_long_easy` | `easy` |
| `medium_long_steady` | `easy` |
| `long_easy` | `long_run` |
| `long_steady_finish` | `long_run` |
| `long_mp_blocks` | `long_run` |
| `cruise_intervals` | `tempo` |
| `continuous_tempo` | `tempo` |
| `broken_tempo` | `tempo` |
| `mp_steady` | `marathon_pace` |
| `hm_pace_blocks` | `marathon_pace` |
| `vo2_intervals` | `interval` |
| `fartlek` | `easy` |
| `hill_strides` | `easy` |
| `hill_repeats` | `interval` |
| `race_day` | `long_run` |

The legacy `calibration` subtype/type still exists for older scoring/export
support, but initial generated plans no longer force a calibration run as the
first workout.

## Workout Selection Rules

Primary quality selection uses:

- race distance;
- phase;
- week number;
- run count;
- volume category;
- experience;
- confidence;
- injury signal;
- age;
- recent ramp;
- durability;
- terrain/course support.

Beginner, low-base, low-confidence, injury-signal, older, high-ramp, or weak
durability plans favor steady aerobic or controlled fartlek over aggressive
intervals.

Marathon emphasis:

- easy volume;
- threshold/cruise work;
- medium-long support for 5-6 day plans;
- long-run durability;
- progressive marathon-pace/race-pace blocks only when supported.

Half-marathon emphasis:

- threshold and half-marathon pace;
- lower long-run burden than marathon;
- VO2/fartlek can appear more often when evidence supports it.

Hill work:

- hill repeats require hilly/rolling course demand, hill access, adequate
  elevation tolerance, non-cutback/taper/race week, no current injury, no high
  ramp, and non-low durability/confidence;
- hill strides appear before repeats for lower-confidence or lower-durability
  runners;
- unsupported hilly courses receive warnings and non-hill alternatives.

## Variable-Based Prescriptions

Workout prescriptions are derived from variables rather than fixed templates.

Inputs:

- weekly volume;
- run days per week;
- long-run distance;
- peak long-run distance;
- subtype;
- phase;
- target distance allocation;
- max session duration;
- terrain;
- fitness confidence;
- feasibility rating;
- current/easy/threshold/bridge/goal paces.

Distance rules:

- long runs use the week long-run target;
- race day uses race distance;
- non-long runs divide remaining weekly volume by role weights;
- medium-long, threshold, interval, steady, race-pace, recovery, and easy roles
  have minimum and maximum distance clamps;
- max duration can reduce distance.

Role weights:

| Role | Weight |
|---|---:|
| easy | 1.00 |
| recovery | 0.70 |
| medium_long | 1.45 |
| steady | 1.15 |
| threshold | 1.15 |
| interval | 1.05 |
| race_pace | 1.20 |
| long/race/rest/support | 0.00 |

Duration:

- calculated from distance and target pace;
- capped by saved weekday/weekend maximum session duration;
- capped sessions add warnings;
- non-run support uses fixed simple durations for display only.

Warmup/cooldown:

- derived as percentages of session duration for sustained/repeat work;
- constrained by min/max bounds;
- simple easy/recovery/long easy runs usually use one continuous step.

Work duration:

- derived from subtype, phase, session duration, available work time, and weekly
  intensity caps;
- specific/peak phases allow the largest work fractions;
- build is moderate;
- base is smaller.

Repeat count:

- strides: derived from work duration, clamped 4-8;
- cruise intervals: derived around 6-minute reps, clamped 3-6;
- broken tempo: around 10-minute blocks, clamped 2-4;
- VO2: around 3-minute reps, clamped 3-6;
- fartlek: around 2-minute pickups, clamped 5-10;
- hill repeats: around 1.25-minute reps, clamped 4-8;
- long race-pace blocks: two or three blocks depending on phase;
- half-marathon pace blocks: derived around 8-minute blocks, clamped 3-5.

Paces:

- easy/recovery/long paces are built from saved or estimated easy pace;
- threshold work uses saved or estimated threshold pace;
- VO2 is faster than threshold;
- race-specific paces use:
  - current race pace when no goal target exists;
  - bridge pace when feasibility is low-confidence or not credible;
  - bridge pace in early phases;
  - goal pace in specific/peak/taper phases when feasibility supports it.

Advanced physiology targets:

- HR targets are optional and derived from explicit HR zones, lactate-threshold
  HR, aerobic-threshold HR, HR reserve, or max HR in that order;
- power targets are optional and derived from explicit power zones, threshold or
  critical power, or a saved easy power range;
- generated `target_hr_zone` uses the advanced HR target when one exists;
- instructions add a short optional physiology target note when HR or power
  guidance exists;
- HR/power targets do not remove pace targets from generated run rows;
- structured workouts remain version 1 and pace-based for export safety.

## Intensity Distribution And Risk

Intensity buckets:

- easy;
- moderate/race-specific;
- threshold;
- VO2;
- repetition/economy.

Weekly caps:

- threshold work <= 10% of weekly volume;
- VO2 work <= 8% of weekly volume;
- repetition/economy work <= 5% of weekly volume.

Whole-plan targets by mode:

- relaxed protects the highest easy share and lowest hard share;
- moderate allows a little more moderate/hard work;
- aggressive and very aggressive allow more specificity only when evidence
  supports it.

Risk enforcement:

- cap excess softens lower-priority quality sessions;
- gray-zone overload softens steady/race-specific/moderate sessions;
- load-stack enforcement compares week-over-week:
  - volume jump;
  - long-run jump;
  - moderate+hard intensity jump;
  - hill-load jump.
- if too many stressors rise together, the generator softens intensity or hill
  specificity first;
- hill-load jumps count even when hill access exists;
- hill/easy strides can be softened when they contribute to stacked stress;
- the safety pass repeats until cascaded week-to-week stress settles or the
  iteration cap is reached;
- completed workouts are not rewritten because this is initial generation only.

Hard-day spacing:

- hard workouts are not placed on consecutive days;
- interval work is not placed within 48 hours before the key long run;
- unsafe preferred workout days are ignored.

## Terrain And Target Style

Terrain assignment:

- hill repeats/strides use hills only when hills are available;
- intervals prefer track, treadmill, flat, then hills;
- fartlek prefers trails/hills when appropriate;
- threshold/race-pace work on flat courses prefers track, flat, or treadmill;
- long runs can use hills only when course demand and recent elevation
  tolerance support it;
- unsupported terrain falls back to available safer terrain.

Effort/HR wording:

- trail-heavy, hilly, no-flat, or weather-risk situations strengthen effort/HR
  guidance in instructions;
- saved physiology targets add optional HR/power guidance to instructions;
- pace targets remain present where possible for Garmin/Intervals export
  compatibility;
- weather affects instructions and warnings, not detailed physiological
  modeling.

## Structured Workout Rules

Generated run workouts use structured workout v1.

Export-safety rules:

- no nested repeats;
- conservative step counts;
- complete time or distance durations for leaf steps;
- pace targets where possible;
- HR zones and power targets may be included as row metadata or text support;
- no RPE-only primary target for publishable run workouts;
- rest, strength, and cross-training do not create run structured workouts.

Structured patterns:

- simple runs: one distance-based work step;
- steady finish: easy segment plus steady segment;
- sustained tempo/race-pace: warmup, work, cooldown;
- repeats: warmup, one repeat block, cooldown;
- race day: race-distance structured run.

## Persisted Output

`training_plans` receives:

- name;
- status;
- start/end dates;
- total weeks;
- assumptions;
- warnings;
- generator version;
- feasibility rating;
- fitness confidence;
- generation assumptions/warnings;
- phase summaries;
- weekly summaries;
- peak summary;
- taper summary;
- fitness anchor summary;
- `generated_by = rule_based_v1`.

`planned_workouts` receives:

- profile and race goal ids;
- workout date;
- week number;
- day label;
- DB-safe workout type;
- title;
- description;
- distance;
- duration;
- target pace range;
- HR target label;
- terrain;
- purpose;
- instructions;
- status;
- structured workout JSON.

Weekly summaries include:

- phase;
- volume;
- long run;
- cutback/taper/race-week flags;
- total run km;
- easy/moderate/threshold/VO2/repetition/hard km;
- hill-load km;
- easy/moderate/hard shares;
- threshold/VO2/repetition caps;
- load risk flags.

## Main Assumptions

- Current product supports one planned workout per date, so true doubles are
  not generated.
- The plan generator supports marathon and half marathon only.
- Missing max session durations are treated as uncapped.
- Missing six-week history falls back to profile fields or conservative
  defaults.
- Race-history text is weak supporting context only and is not treated as
  current proof of fitness.
- Strava data is useful evidence but not definitive proof of maximal ability.
- Power evidence and saved power zones are supporting signals and optional
  workout guidance, not a replacement for pace-based export targets.
- Garmin zone import is not implemented in this milestone; manual profile input
  is the supported path for HR and power zones.
- Weather notes are caution signals, not forecast simulation.
- The generator should be conservative with injury, fatigue, high ramp, poor
  durability, low frequency, and weak confidence.
- The improved initial generator is separate from adaptive adjustment logic;
  adjustment still works through existing generic fields.

## Regression Harness

Milestone 12L added a conformance matrix that covers:

- marathon and half marathon;
- 3, 4, 5, and 6 run-day layouts;
- beginner, intermediate, and advanced profiles;
- weak and strong evidence;
- flat and hilly courses;
- duration-capped profiles;
- relaxed and aggressive modes.

The harness summarizes generated plans rather than snapshotting every daily
row. It asserts:

- phase/taper presence;
- peak volume and peak long-run sanity;
- weekly run count;
- DB-safe workout types;
- no generated calibration-first workout;
- export-safe structured workouts;
- pace targets on run rows;
- weekly intensity caps;
- easy/moderate/hard distribution;
- no unsafe hard-day spacing;
- no stacked volume/long-run/intensity/hill jumps;
- duration caps;
- hilly-course warnings and hill exposure rules;
- flat-course terrain bias;
- fastest Strava run not used as a max anchor without evidence;
- manual physiology targets do not break pace-safe structured workout exports;
- suggested goal behavior for not-credible targets.

## Current Conformance Estimate

Practical conformance to the external plan-generation spec is estimated at
about 88% for the current product constraints.

Approximate rubric:

| Area | Fit |
|---|---:|
| Inputs/history | 85% |
| Evidence/fitness | 82% |
| Load/phase logic | 90% |
| Workout library/prescriptions | 88% |
| Intensity/risk enforcement | 92% |
| Terrain/durability specificity | 86% |
| Metadata/explainability | 90% |
| App contract/export compatibility | 95% |

Tolerated remaining gaps:

- full aerobic-efficiency trend modeling;
- automatic Garmin/Strava zone import;
- detailed weather modeling;
- persisted fueling/nutrition strategy;
- true double-run scheduling;
- adjustment logic understanding rich workout subtypes and weekly caps;
- richer race-history parsing.

These gaps are intentional current-product limits, not blockers for treating
the initial plan generator as complete.
