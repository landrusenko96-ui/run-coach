import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateStravaActivityRawSummary } from "../lib/db/stravaActivities.ts";

function createMockSupabaseUpdate() {
  const state = {
    table: null,
    updatePayload: null,
    eqCalls: [],
  };
  const chain = {
    update(payload) {
      state.updatePayload = payload;
      return chain;
    },
    eq(column, value) {
      state.eqCalls.push([column, value]);

      if (state.eqCalls.length === 2) {
        return Promise.resolve({ error: null });
      }

      return chain;
    },
  };

  return {
    state,
    supabase: {
      from(table) {
        state.table = table;
        return chain;
      },
    },
  };
}

describe("Strava activities DB helpers", () => {
  it("updates only raw summary evidence for an existing Strava audit row", async () => {
    const mock = createMockSupabaseUpdate();
    const rawSummaryJson = {
      summary: { id: "activity-1" },
      detail: { detailed: true },
      streams: { heartrate: { data: [130, 140] } },
      evidence: { classificationHint: "controlled" },
    };

    await updateStravaActivityRawSummary(mock.supabase, {
      userId: "user-1",
      stravaActivityId: "activity-1",
      rawSummaryJson,
    });

    assert.equal(mock.state.table, "strava_activities");
    assert.deepEqual(mock.state.updatePayload, {
      raw_summary_json: rawSummaryJson,
    });
    assert.deepEqual(mock.state.eqCalls, [
      ["user_id", "user-1"],
      ["strava_activity_id", "activity-1"],
    ]);
    assert.equal("logged_workout_id" in mock.state.updatePayload, false);
    assert.equal("planned_workout_id" in mock.state.updatePayload, false);
  });
});
