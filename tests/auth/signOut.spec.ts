import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: mocks.cookieSet,
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock("@/lib/auth/nextAuth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: mocks.signOut,
}));

import { signOutAction } from "@/lib/auth/actions";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  SIGN_OUT_REDIRECT_PATH,
} from "@/lib/auth/cookies";

describe("Phase 5H.1 sign-out action", () => {
  beforeEach(() => {
    mocks.cookieSet.mockReset();
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue(undefined);
  });

  it("expires the active-organization cookie and signs out to /sign-in", async () => {
    await signOutAction();

    expect(mocks.cookieSet).toHaveBeenCalledTimes(1);
    const [name, value, options] = mocks.cookieSet.mock.calls[0];
    expect(name).toBe(ACTIVE_ORGANIZATION_COOKIE);
    expect(value).toBe("");
    expect(options).toMatchObject({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
    });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({
      redirectTo: SIGN_OUT_REDIRECT_PATH,
    });
    expect(SIGN_OUT_REDIRECT_PATH).toBe("/sign-in");
  });

  it("does not clear unrelated cookies", async () => {
    await signOutAction();
    const names = mocks.cookieSet.mock.calls.map((call) => call[0]);
    expect(names).toEqual([ACTIVE_ORGANIZATION_COOKIE]);
  });
});
