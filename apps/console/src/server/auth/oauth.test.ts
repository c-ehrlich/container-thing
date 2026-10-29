import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFreshSession } from "./oauth";
import type { Session } from "./session";
import { readSession, writeSession } from "./session";

const refreshAccessToken = vi.fn();

vi.mock("../env", () => ({ env: { APP_URL: "http://localhost:3000" } }));
vi.mock("./session", () => ({
  cookieDefaults: () => ({}),
  readSession: vi.fn(),
  writeSession: vi.fn(),
}));
vi.mock("arctic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("arctic")>()),
  OAuth2Client: class {
    refreshAccessToken = refreshAccessToken;
  },
}));

const expired = (refreshToken: string): Session => ({
  accessToken: "old-access",
  refreshToken,
  accessTokenExpiresAt: Date.now() - 1_000,
});

const tokens = (accessToken: string, refreshToken: string) => ({
  accessToken: () => accessToken,
  hasRefreshToken: () => true,
  refreshToken: () => refreshToken,
  accessTokenExpiresAt: () => new Date(Date.now() + 3_600_000),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getFreshSession", () => {
  it("returns a session that isn't about to expire without refreshing", async () => {
    const session = { ...expired("r"), accessTokenExpiresAt: Date.now() + 3_600_000 };
    vi.mocked(readSession).mockResolvedValue(session);

    expect(await getFreshSession()).toBe(session);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  // Railway rejects a refresh token once it has been used, so a second refresh would fail.
  it("refreshes once for requests that arrive together with the same expired session", async () => {
    vi.mocked(readSession).mockResolvedValue(expired("refresh-1"));
    refreshAccessToken.mockResolvedValueOnce(tokens("new-access", "refresh-2"));
    refreshAccessToken.mockRejectedValue(new Error("invalid_grant"));

    const sessions = await Promise.all([getFreshSession(), getFreshSession(), getFreshSession()]);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    for (const session of sessions) {
      expect(session).toMatchObject({ accessToken: "new-access", refreshToken: "refresh-2" });
    }
    expect(writeSession).toHaveBeenCalledTimes(3);
  });

  it("is signed out when the refresh fails", async () => {
    vi.mocked(readSession).mockResolvedValue(expired("revoked"));
    refreshAccessToken.mockRejectedValue(new Error("invalid_grant"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await getFreshSession()).toBeNull();
    expect(writeSession).not.toHaveBeenCalled();
  });
});
