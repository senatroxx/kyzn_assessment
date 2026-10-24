import { z } from "zod";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiRequestError, apiRequest } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("apiRequest", () => {
  test("parses JSON responses against the supplied schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      apiRequest("/health", z.object({ status: z.string() })),
    ).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/health",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  test("surfaces server messages and rejects malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":{"message":"Try later"}}', { status: 503 }),
        ),
    );
    await expect(apiRequest("/v1/leads", z.unknown())).rejects.toMatchObject({
      message: "Try later",
      status: 503,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 })),
    );
    await expect(apiRequest("/health", z.unknown())).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });
});
