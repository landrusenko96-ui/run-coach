import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AuthRequiredError,
  requireServerUser,
} from "../lib/supabase/auth.ts";

function supabaseWithUser(user, error = null) {
  return {
    auth: {
      getUser: async () => ({
        data: { user },
        error,
      }),
    },
  };
}

describe("server auth guard", () => {
  it("rejects unauthenticated users before protected route work runs", async () => {
    await assert.rejects(
      requireServerUser(supabaseWithUser(null)),
      AuthRequiredError,
    );
  });

  it("rejects anonymous Supabase users", async () => {
    await assert.rejects(
      requireServerUser(
        supabaseWithUser({
          id: "anonymous-user",
          is_anonymous: true,
        }),
      ),
      AuthRequiredError,
    );
  });

  it("returns non-anonymous authenticated users", async () => {
    const user = {
      id: "real-user",
      is_anonymous: false,
    };

    assert.equal(await requireServerUser(supabaseWithUser(user)), user);
  });
});
