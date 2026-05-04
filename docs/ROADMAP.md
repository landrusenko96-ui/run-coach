# Run.B*tch.app Roadmap

**Project source document**  
**Working app concept:** personal marathon preparation app that dynamically adjusts the training plan based on user performance.  
**Primary user:** beginner builder using Codex, GitHub, Vercel, ChatGPT Plus, Perplexity Pro, and free-tier services.  
**Primary goal:** build a useful personal side project, not an enterprise product.

---

## 1. Strategic Direction

The correct strategy is not to build the full Run.B*tch.app vision immediately. The first build should be a narrow but functional adaptive training system:

1. user profile;
2. race goal;
3. rule-based training plan generation;
4. calibration workout;
5. workout logging;
6. workout scoring;
7. plan adjustment;
8. dashboard;
9. Strava import.

The app should prove the core loop before adding social features, avatars, routes, Spotify, global marathon databases, or Garmin workout publishing.

**Core product loop:**

```text
User profile -> Race goal -> Plan generation -> Workout completion -> Workout evaluation -> Plan adjustment -> Updated next workouts
```

Everything else is secondary until this loop works reliably.

---

## 2. Feasibility Assessment

### 2.1 Clearly feasible for the first build

| Feature | Feasible now? | Notes |
|---|---:|---|
| User login with username/password | Yes | Use Supabase Auth or custom auth. Supabase is recommended. |
| User profile/questionnaire | Yes | Straightforward database forms. |
| Marathon/half-marathon goal setup | Yes | Start with manual event input. Add race database later. |
| Plan generation | Yes | Start rule-based, not fully AI-based. |
| Calibration workout | Yes | Build it as the first required workout. |
| Workout calendar/list | Yes | Store generated workouts in database. |
| Manual workout logging | Yes | Build before Strava. |
| Strava import | Yes | Use Strava OAuth and API. Start with manual refresh. |
| Avoid duplicate imports | Yes | Store Strava activity ID and reject duplicates. |
| Post-workout feedback | Yes | Start rule-based, then AI-assisted. |
| Dynamic plan adjustment | Yes | Must be based on explicit adjustment rules. |
| Progress dashboard | Yes | Workouts completed, missed, compliance, projected time. |
| Shoe mileage tracking | Yes | Easy after activity import exists. |

### 2.2 Possible but not first-version friendly

| Feature | Feasible? | Why postpone |
|---|---:|---|
| Garmin workout push | Maybe, but hard | Garmin Training API access may require developer program approval. |
| Garmin direct activity import | Maybe, but hard | Strava is the simpler bridge from Garmin Connect. |
| Global marathon database with prices | Partly | Dates are findable; prices, participants, and course metadata are inconsistent. |
| Route generation | Hard | Requires maps, routing, and elevation data. Usually API-dependent. |
| Weather-based race pacing | Medium | Requires weather API and forecast logic. |
| Spotify integration | Medium | OAuth complexity with low core value. |
| AI coach chat | Medium | Useful later, but depends on stable internal data. |
| 3D avatar | Hard | Separate product inside the product. Postpone. |
| Real gear images | Medium/hard | Product-image sourcing and rights are messy. Manual upload is safer. |
| Gear price-drop alerts | Hard | Web scraping retailers is fragile and may violate terms. |

---

## 3. Recommended Technical Stack

| Layer | Recommendation | Reason |
|---|---|---|
| App framework | Next.js | Works well with Vercel and full-stack web apps. |
| Language | TypeScript | Safer than plain JavaScript for a beginner using AI coding. |
| Hosting | Vercel Hobby | Free and simple for a personal web app. |
| Database | Supabase Postgres | Free tier, real SQL database, easy auth/storage/API. |
| Auth | Supabase Auth | Do not build password security manually at first. |
| Styling | Tailwind CSS + shadcn/ui | Minimal, easy to change later. |
| Charts | Recharts | Simple dashboard charts. |
| Repository | GitHub | Version control and Vercel deployment. |
| Activity API | Strava | Best bridge from Garmin to the app. |
| Background jobs | Avoid initially | Use manual refresh buttons first. |

### 3.1 Avoid early

Do not start with React Native, mobile app stores, Docker, AWS, custom servers, Kubernetes, Firebase Functions, Garmin API, paid map APIs, or complex background workers.

---

## 4. First MVP Definition

The first MVP is a private web app that can:

1. create a user profile;
2. enter a marathon or half-marathon goal;
3. generate a 12-20 week training plan;
4. force the first session to be a calibration workout;
5. log workouts manually;
6. score workouts;
7. adjust future workouts;
8. show progress and a projected finish-time range.

### 4.1 Excluded from MVP

Do not include yet:

- avatar;
- Spotify;
- race marketplace;
- route generation;
- Garmin workout push;
- gear rewards;
- social sharing;
- price tracking;
- full AI coach chat;
- global race database.

---

## 5. Project Setup Roadmap

### Phase 1 - Project foundation

**Goal:** create an empty but deployable web app.

**Tools:** GitHub, Vercel, Next.js, TypeScript, Tailwind, shadcn/ui.

**Codex prompt:**

```text
Create a new Next.js app called run-coach using TypeScript, App Router, Tailwind CSS, and shadcn/ui.
Set up a clean minimal layout with pages for Dashboard, Profile, Goal, Plan, Workouts, and Settings.
Do not add complex styling.
Use a simple modular folder structure and include a README explaining how to run the app locally.
```

**Checkpoint:**

- app runs locally;
- GitHub repo exists;
- Vercel deployment works;
- simple page edits appear online.

---

### Phase 2 - Database and architecture

**Goal:** add persistent data and keep the training engine separate from UI.

**Recommended tables:**

```text
users
profiles
race_goals
training_plans
planned_workouts
logged_workouts
workout_evaluations
plan_adjustments
strava_connections
strava_activities
gear_items
gear_usage
```

**Recommended folder structure:**

```text
/app
/components
/lib
  /training
    planGenerator.ts
    workoutScoring.ts
    planAdjustment.ts
    racePrediction.ts
  /strava
    client.ts
    importActivities.ts
  /db
    types.ts
```

**Codex prompt:**

```text
Add Supabase to the project.
Create SQL migrations for profiles, race_goals, training_plans, planned_workouts, logged_workouts, workout_evaluations, and plan_adjustments.
Use TypeScript types for all database entities.
Keep training logic separate from UI in /lib/training.
Add a simple seed script with one demo user profile and one marathon goal.
```

**Checkpoint:**

- tables exist in Supabase;
- app can read/write profile data;
- training logic is not hardcoded inside React components.

---

### Phase 3 - User profile

**Goal:** collect the minimum useful runner data without overbuilding.

**High-value fields:**

```text
username
age or date of birth
sex
height
weight
current weekly mileage
longest recent run
recent race result
easy pace
threshold pace
max heart rate, if known
resting heart rate, if known
available training days
preferred long run day
injury status
terrain availability
training aggressiveness
```

**Optional later:**

```text
VO2 max
bloodwork
hormonal issues
sleep
stress
nutrition preferences
shoe rotation
```

**Codex prompt:**

```text
Build the Profile page.
Create a multi-section form for runner profile data.
Fields should be optional unless essential.
Add validation with Zod.
Store profile data in Supabase.
Include terrain availability options: flat, hills, track, treadmill, trails, downhill.
Include training preferences: conservative, balanced, aggressive.
```

**Checkpoint:**

- profile saves;
- profile reloads correctly;
- incomplete profile still works.

---

### Phase 4 - Race goal setup

**Goal:** allow one active goal.

**Fields:**

```text
race name
race date
distance: marathon or half-marathon
target finish time
target priority: finish / PR / aggressive goal
course elevation estimate
expected temperature optional
```

**Codex prompt:**

```text
Build the Race Goal page.
Allow the user to create one active race goal.
Support marathon and half marathon only.
Fields: race name, race date, distance, target finish time, target priority, course elevation notes, expected weather notes.
Show weeks remaining until race.
Store in Supabase.
```

**Checkpoint:**

- one active race goal can be created and edited;
- app calculates weeks until race;
- app handles unrealistic goals gently.

---

## 6. Training Engine Roadmap

### Phase 5 - Plan generator v1

**Important decision:** do not use AI as the core plan generator at first. Use deterministic rules so the app is debuggable.

**Inputs:**

```text
race distance
race date
target time
current weekly mileage
recent long run
available days
training aggressiveness
terrain availability
recent race result or estimated fitness
```

**Outputs:**

```text
week number
workout date
workout type
distance
intensity
pace target
heart rate target optional
terrain suggestion
purpose
```

**Workout types v1:**

```text
easy
long_run
tempo
interval
marathon_pace
recovery
rest
strength_optional
calibration
```

**Plan rules:**

- first workout is always calibration;
- long run once per week;
- one quality workout per week at first;
- later two quality workouts only if profile supports it;
- recovery weeks every 3-4 weeks;
- taper in final 2-3 weeks;
- weekly mileage should not jump too aggressively;
- unavailable terrain should not be prescribed;
- missed workouts should not be stacked later.

**Codex prompt:**

```text
Implement /lib/training/planGenerator.ts.
Create a deterministic marathon/half-marathon plan generator.
Inputs: runner profile and race goal.
Outputs: planned_workouts for each week until race.
Rules:
- First workout must be calibration.
- Include easy runs, long runs, tempo, intervals, marathon pace, recovery, rest, and optional strength.
- Respect available training days and terrain availability.
- Include recovery weeks every 4th week.
- Include taper in final 2-3 weeks.
- Avoid increasing weekly running volume too aggressively.
- Store generated workouts in Supabase.
Add unit tests for plan generation.
```

**Checkpoint:**

- plan generates without crashing;
- workouts appear on a calendar/list;
- every workout has purpose and target;
- plan looks reasonable when inspected manually.

---

### Phase 6 - Calibration workout

**Default calibration workout:**

```text
10 min easy warmup
20 min steady hard effort
10 min cooldown
```

This can estimate threshold pace from the 20-minute segment. A 5 km time trial is possible later but is more stressful.

**Codex prompt:**

```text
Add calibration workout logic.
The first generated workout should be a calibration run:
10 min easy warmup, 20 min steady hard effort, 10 min cooldown.
After the workout is logged, estimate threshold pace and update training paces.
If heart rate is available, store average HR for calibration segment.
Show explanation of how calibration affects the plan.
```

**Checkpoint:**

- calibration workout appears first;
- logging calibration updates estimated training paces;
- future workouts use updated paces.

---

### Phase 7 - Manual workout logging

**Fields:**

```text
date
distance
duration
average pace
average heart rate optional
max heart rate optional
cadence optional
elevation gain optional
RPE: 1-10
notes
linked planned workout
```

**Codex prompt:**

```text
Build manual workout logging.
Allow user to log a run and link it to a planned workout.
Calculate pace from distance and duration.
Store logged_workouts.
Show planned vs actual comparison for distance, duration, and pace.
Only support run and treadmill run types for now.
```

**Checkpoint:**

- workout can be logged manually;
- workout links to planned workout;
- dashboard shows completed workouts.

---

### Phase 8 - Workout scoring

**Scoring categories:**

| Score | Meaning |
|---|---|
| Completion | Did the user do the prescribed workout? |
| Pace accuracy | Did the user hit the target pace range? |
| Effort control | Was HR/RPE appropriate? |
| Distance accuracy | Was intended distance completed? |
| Consistency | Was this aligned with recent training? |
| Training value | Did this move the plan forward? |
| Risk flag | Did this look too hard, too fast, or risky? |

**Example output:**

```text
Overall: 82/100
Pace accuracy: 76
Distance completion: 95
Effort control: 70
Training value: 88
Risk: medium
```

**Codex prompt:**

```text
Implement /lib/training/workoutScoring.ts.
Given a planned workout and logged workout, calculate:
overall_score, pace_accuracy, distance_completion, effort_control, training_value, risk_level.
Use transparent rule-based formulas.
Handle missing HR and cadence gracefully.
Store result in workout_evaluations.
Show scoring breakdown in the workout detail page.
Add tests.
```

**Checkpoint:**

- every logged workout gets a score;
- missing HR does not break scoring;
- score is explainable.

---

### Phase 9 - Plan adjustment logic

**Trigger conditions:**

```text
missed workout
workout completed much harder than expected
workout completed much easier than expected
pace improving over several workouts
heart rate unusually high
long run missed
injury/pain flag
fatigue trend
```

**Adjustment types:**

```text
shift workout date
reduce next workout intensity
replace workout with recovery run
increase paces slightly
decrease paces slightly
reduce weekly mileage
add rest day
keep plan unchanged
```

**Hard rule:** never compensate for missed training by doubling intensity.

**Codex prompt:**

```text
Implement /lib/training/planAdjustment.ts.
After each logged workout, evaluate whether the future plan should change.
Adjustment rules:
- If workout was missed, do not stack it on the next day.
- If effort was too high, reduce next quality workout or convert to easy run.
- If 3 recent workouts were easier than expected, slightly update training paces.
- If long run was missed, adjust future long run progression conservatively.
- If risk is high, add recovery recommendation.
- Save every adjustment to plan_adjustments with reason and before/after values.
Do not rewrite completed workouts.
Add tests for common scenarios.
```

**Checkpoint:**

- app adjusts future workouts only;
- every adjustment has a visible reason;
- adjustment history can be inspected.

---

### Phase 10 - Progress dashboard

**Dashboard v1:**

```text
Race countdown
Current projected finish time range
Plan completion %
Workouts completed
Workouts missed
Weekly mileage trend
Long run progression
Recent workout scores
Current training paces
Next 7 days
```

**Projected finish time:** show a range, not false precision.

Example:

```text
Current marathon estimate: 3:48-3:58
Confidence: medium
```

**Codex prompt:**

```text
Build Dashboard page.
Show race countdown, completion rate, missed workouts, weekly mileage, long run progression, recent workout scores, current training paces, next 7 days, and projected finish time range.
Implement /lib/training/racePrediction.ts.
Prediction should return a range and confidence level, not a single false-precision number.
```

**Checkpoint:**

- dashboard answers “Where am I right now?”;
- projected time updates after workouts;
- missed workouts affect projection.

---

## 7. Integrations Roadmap

### Phase 11 - Strava integration

Start with manual refresh, not webhooks.

**Required flow:**

1. User clicks “Connect Strava.”
2. OAuth authorization happens.
3. App stores access token and refresh token securely.
4. User clicks “Import latest activity.”
5. App fetches recent Strava activities.
6. App filters only runs.
7. App ignores duplicates using Strava activity ID.
8. App maps activity to planned workout by date/proximity.
9. App creates logged workout.
10. App scores workout.
11. App adjusts plan if needed.

**Codex prompt:**

```text
Add Strava OAuth integration.
Create strava_connections table for access token, refresh token, expiry, athlete id.
Create strava_activities table storing Strava activity ID and imported metadata.
Build Settings > Connect Strava.
Build Workouts > Import latest Strava run button.
On import:
- fetch recent activities
- filter only Run, TrailRun if desired, Treadmill/VirtualRun if available
- skip duplicates by Strava activity ID
- map to nearest planned workout by date
- create logged_workout
- run workoutScoring
- run planAdjustment
Do not import cycling, swimming, strength, walking, or other activities.
```

**Checkpoint:**

- Strava connects;
- one real run imports;
- duplicate import is prevented;
- imported run affects dashboard.

---

### Phase 12 - Strava webhooks

Only add after manual refresh works.

**Codex prompt:**

```text
Add Strava webhook endpoint.
Implement subscription verification and event handling.
When a new activity event arrives, fetch the activity using stored Strava credentials, import only if it is a run, skip duplicates, score it, and adjust plan.
Keep the manual refresh button as a fallback.
```

**Checkpoint:**

- new Strava activity can arrive without pressing refresh;
- manual refresh still works;
- webhook errors are logged.

---

### Phase 13 - Garmin workout export helper

Official Garmin workout publishing may be difficult because Garmin Training API access may require developer approval. Use a manual helper first.

**Practical workaround:**

1. show workout clearly in the app;
2. format workout steps for easy Garmin Connect recreation;
3. optionally generate text export;
4. keep API integration for much later.

**Codex prompt:**

```text
Add Garmin workout export helper.
For each planned workout, show structured workout steps:
warmup, intervals, recoveries, cooldown.
Format them in a way that is easy to manually recreate in Garmin Connect.
Do not attempt Garmin API integration yet.
```

---

## 8. Post-MVP Feature Roadmap

### Phase 14 - Gear tracking

**Fields:**

```text
shoe name
brand
model
color
size
purchase date
purchase price
starting mileage
retired yes/no
image upload optional
```

**Codex prompt:**

```text
Build gear tracking.
Create gear_items and gear_usage.
Allow user to add shoes with brand, model, color, size, purchase price, starting mileage, and optional image upload.
Allow each logged run to be assigned to shoes.
Calculate total mileage per shoe.
Show warnings at 300 km, 500 km, 700 km, and custom threshold.
```

---

### Phase 15 - AI-generated workout feedback

**Correct architecture:**

```text
Rule-based scoring -> structured metrics -> AI writes human-readable feedback
```

AI should explain the evaluation. AI should not be the only evaluator.

**Codex prompt:**

```text
Add AI-generated workout feedback.
Input should be structured workout evaluation data, not raw vague text only.
AI should generate:
- what went well
- what did not go well
- what this means for the plan
- what to focus on next workout
Keep tone direct, slightly irreverent, but not unsafe or abusive.
Fallback to rule-based template if AI call fails.
```

Cost note: ChatGPT Plus does not automatically make OpenAI API calls free. To avoid extra costs, begin by generating a structured “coach brief” that can be manually pasted into ChatGPT.

---

### Phase 16 - Trainer chat

Build only after the app has enough internal data.

**Chat scope:**

```text
current plan
past workouts
next workout
nutrition basics
route ideas
race preparation
recovery suggestions
gear usage
```

First version can be a “Coach Brief” page instead of a real chat.

**Coach Brief should include:**

```text
User profile
Race goal
Current plan status
Recent workouts
Specific question
```

---

### Phase 17 - Race directory

Start curated, not global.

**Fields:**

```text
race name
city
country
date
distance
website
elevation notes
typical participants
registration price optional
source URL
last checked date
```

**Codex prompt:**

```text
Add race directory.
Create races table with race name, city, country, date, distance, website, elevation notes, participant estimate, registration price, source URL, last checked date.
Allow user to select from race directory or enter custom race manually.
Seed with a small curated list.
```

---

### Phase 18 - Nutrition and fueling

Start rule-based.

**Inputs:**

```text
workout duration
intensity
temperature optional
user weight optional
time of day
```

**Outputs:**

```text
pre-run meal suggestion
during-run carbs/gels
hydration note
post-run protein/carbs timing
```

**Codex prompt:**

```text
Add fueling suggestions per workout.
Use workout duration and intensity.
For short easy runs, suggest minimal fueling.
For long runs over 90 minutes, suggest carbs during run.
Show pre-run, during-run, and post-run suggestions.
Keep advice general and non-medical.
```

---

### Phase 19 - Social sharing

Start simple.

**First version:**

```text
Generate share card as image
Workout summary
Workout score
One short feedback line
No Strava map yet
```

**Codex prompt:**

```text
Add share card generator.
Create a simple visual card for a completed workout with distance, duration, pace, workout score, and one feedback sentence.
Allow download as PNG.
Do not include Strava map yet.
```

---

### Phase 20 - Runner score

Do not start by comparing every user directly to the marathon world record. It can be fun, but it is easy to make misleading.

Better v1:

```text
Runner Score = weighted score across endurance, speed, consistency, durability, execution, and progression.
```

**Subscores:**

```text
endurance
speed
consistency
execution
progression
durability
```

**Codex prompt:**

```text
Implement runner score.
Use logged workout history and profile data.
Subscores:
- endurance
- speed
- consistency
- execution
- progression
- durability
Each score should be 0-100 with transparent formula.
Do not let the user manually edit scores.
Show score history over time.
```

---

### Phase 21 - Avatar and rewards

Treat this as a separate product layer. Do not build it until the training app works.

Simple version first:

```text
2D avatar
clothing slots: shoes, top, shorts, hat, glasses
rarity classes
random drops after completed workouts
challenge-based unlocks
```

**Codex prompt:**

```text
Add simple 2D avatar reward system.
Create cosmetic_items and user_cosmetics.
Slots: shoes, top, shorts, hat, glasses.
Add rarity: common, uncommon, rare, epic, legendary.
After a completed workout, award a random cosmetic based on weighted probability.
Add challenge-based guaranteed unlocks.
Use placeholder items only.
```

---

## 9. What to Ask Codex vs ChatGPT vs Perplexity

### Ask Codex when code needs to change

Examples:

```text
Implement this table.
Build this page.
Fix this bug.
Refactor this file.
Add tests.
Connect this API.
Explain this error.
```

Codex should work inside the repo.

### Ask ChatGPT when product, architecture, or logic thinking is needed

Examples:

```text
Design the plan adjustment rules.
Review this database schema.
Is this feature too complex for MVP?
Create a Codex prompt for the next milestone.
Debug this architecture decision.
Help me simplify this feature.
```

### Ask Perplexity when current external research is needed

Examples:

```text
Current Garmin API access rules.
Current Strava API restrictions.
Marathon training methodology research.
Race calendar sources.
Nutrition guidelines.
Weather API free tiers.
```

Use Perplexity for research, not as the main software architect.

---

## 10. First 10 Concrete Actions

1. Create the Next.js project.
2. Deploy the empty app on Vercel.
3. Create a Supabase free project.
4. Connect Supabase to the app.
5. Build the profile form.
6. Build the race goal page.
7. Build the deterministic plan generator.
8. Build manual workout logging.
9. Build workout scoring.
10. Build plan adjustment.

Only after these 10 actions should Strava be added.

---

## 11. Milestones and Success Criteria

### Milestone 1 - Skeleton app

```text
App deployed
Navigation works
Supabase connected
Basic pages exist
```

### Milestone 2 - Profile + race goal

```text
User profile saved
Race goal saved
Weeks until race calculated
```

### Milestone 3 - Plan generation

```text
Plan generated
First workout is calibration
Plan respects available days
Plan has taper
Plan has recovery weeks
```

### Milestone 4 - Logging + scoring

```text
Manual workout logged
Workout linked to planned workout
Score generated
Dashboard updated
```

### Milestone 5 - Adaptive plan

```text
Missed workout handled
Too-hard workout reduces next stress
Strong trend updates paces
Adjustment history visible
```

### Milestone 6 - Strava import

```text
Strava connected
Latest run imported
Duplicate prevented
Run scored
Plan adjusted
```

### Milestone 7 - Useful personal app

```text
You can use it for a real training week
Dashboard tells you what to do next
Plan changes make sense
You trust the output enough to follow it
```

---

## 12. Recommended v1 App Structure

```text
Dashboard
- next workout
- race countdown
- projected finish range
- recent score
- plan progress

Profile
- runner data
- availability
- terrain
- preferences

Goal
- marathon/half marathon target
- race date
- target time

Plan
- weekly plan
- workout details
- regenerate plan button, protected by warning

Workouts
- manual log
- imported runs later
- workout history
- evaluations

Settings
- Strava connection
- data export
- sign out
```

Later sections:

```text
Gear
Coach
Nutrition
Race Directory
Gamification
Avatar
```

---

## 13. Training Data Model Examples

### Planned workout

```ts
type PlannedWorkout = {
  id: string;
  date: string;
  type: "easy" | "long_run" | "tempo" | "interval" | "marathon_pace" | "recovery" | "rest" | "strength_optional" | "calibration";
  distanceKm?: number;
  durationMin?: number;
  targetPaceMinPerKm?: {
    min: number;
    max: number;
  };
  targetHrZone?: string;
  terrain?: "flat" | "hilly" | "uphill" | "downhill" | "track" | "treadmill" | "trail";
  purpose: string;
  instructions: string[];
};
```

### Logged workout

```ts
type LoggedWorkout = {
  date: string;
  distanceKm: number;
  durationSec: number;
  avgPaceSecPerKm: number;
  avgHr?: number;
  maxHr?: number;
  cadence?: number;
  elevationGainM?: number;
  rpe?: number;
  source: "manual" | "strava";
  sourceActivityId?: string;
  plannedWorkoutId?: string;
};
```

### Workout evaluation

```ts
type WorkoutEvaluation = {
  overallScore: number;
  paceAccuracy: number;
  distanceCompletion: number;
  effortControl: number;
  trainingValue: number;
  riskLevel: "low" | "medium" | "high";
  summary: string;
};
```

### Plan adjustment

```ts
type PlanAdjustment = {
  reason: string;
  adjustmentType:
    | "none"
    | "reduce_intensity"
    | "shift_workout"
    | "update_paces"
    | "add_recovery"
    | "reduce_volume";
  affectedWorkoutIds: string[];
  explanation: string;
};
```

---

## 14. Key Risks and How to Manage Them

| Risk | Mitigation |
|---|---|
| App becomes too broad | Follow the milestone order and postpone non-core features. |
| AI generates plausible but unsafe plans | Use deterministic plan logic first. Use AI only to explain. |
| Beginner gets blocked by integrations | Build manual logging before Strava or Garmin. |
| Garmin integration becomes impossible | Use Garmin workout export helper as workaround. |
| Training logic becomes untestable | Keep logic in /lib/training and add tests. |
| UI becomes a distraction | Keep design blank/minimal until the engine works. |
| Medical/health data creates privacy risk | Keep sensitive fields optional and postpone deep health tracking. |
| Race database becomes a data-maintenance burden | Start curated and manual. |
| Route/price scraping becomes fragile | Postpone; avoid scraping as a core dependency. |

---

## 15. Immediate Next Prompt for Codex

Use this as the first implementation prompt:

```text
Create a new Next.js TypeScript app called run-coach with App Router, Tailwind, shadcn/ui, and a minimal navigation layout: Dashboard, Profile, Goal, Plan, Workouts, Settings. Keep styling extremely minimal and make the structure easy to extend. Add a README with local setup instructions.
```

---

## 16. Final Recommendation

The first target should be:

```text
A private web app that generates a marathon plan, lets the user log workouts manually, scores them, adjusts the next 1-2 weeks, and shows projected marathon finish-time range.
```

Then add:

```text
Strava import.
```

Then add:

```text
Gear tracking.
```

Then add:

```text
AI-generated feedback.
```

Everything else should wait until the adaptive training loop works.
