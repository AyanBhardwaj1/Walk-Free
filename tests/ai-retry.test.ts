import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "../shared/errors";

const requestJson = vi.fn();
vi.mock("../server/network.js", async (original) => ({
  ...(await original<typeof import("../server/network")>()),
  requestJson: (...args: unknown[]) => requestJson(...args),
}));
const { chatCompletion } = await import("../server/ai");

afterEach(() => requestJson.mockReset());

const config = {
  key: "meta-key",
  baseUrl: "https://api.meta.ai/v1",
  model: "muse-spark-1.3",
};
const ok = { choices: [{ message: { content: "Take Speedway." } }] };
const upstream = (status?: number) =>
  new ServiceError(
    "UPSTREAM_UNAVAILABLE",
    status
      ? `The data provider returned HTTP ${status}. Please try again later.`
      : "The data provider could not be reached.",
    502,
  );
const ask = () =>
  chatCompletion(config, [{ role: "user", content: "Coolest way?" }]);

describe("model call retries", () => {
  it("retries once after a dropped connection or a 503", async () => {
    for (const failure of [upstream(), upstream(503), upstream(502)]) {
      requestJson.mockReset();
      requestJson.mockRejectedValueOnce(failure).mockResolvedValueOnce(ok);
      await expect(ask()).resolves.toMatchObject({ content: "Take Speedway." });
      expect(requestJson).toHaveBeenCalledTimes(2);
    }
  });

  it("gives up after the second failure", async () => {
    requestJson.mockRejectedValue(upstream(503));
    await expect(ask()).rejects.toBeInstanceOf(ServiceError);
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it("never retries a rejected key, a bad request or a rate limit", async () => {
    for (const status of [400, 401, 403, 404, 429]) {
      requestJson.mockReset();
      requestJson.mockRejectedValueOnce(upstream(status));
      await expect(ask()).rejects.toBeInstanceOf(ServiceError);
      expect(requestJson).toHaveBeenCalledTimes(1);
    }
  });

  it("never retries a timeout, which would overrun the function's time", async () => {
    requestJson.mockRejectedValueOnce(
      new ServiceError("TIMEOUT", "The data provider took too long.", 504),
    );
    await expect(ask()).rejects.toBeInstanceOf(ServiceError);
    expect(requestJson).toHaveBeenCalledTimes(1);
  });
});
