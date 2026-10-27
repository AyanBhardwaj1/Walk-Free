import { EnvHttpProxyAgent, fetch } from "undici";

/** Keep inherited HTTPS proxy and CA configuration; never bypass TLS validation. */
const dispatcher = new EnvHttpProxyAgent();
export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
    public details?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
export interface RequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
}
export async function requestBytes(
  url: string,
  options: RequestOptions = {},
): Promise<Uint8Array> {
  let response;
  try {
    response = await fetch(url, {
      dispatcher,
      method: options.method ?? "GET",
      body: options.body,
      headers: {
        "User-Agent":
          "Walk-Free/0.1 (walking environment research; github.com/AyanBhardwaj1/Walk-Free)",
        Accept: "application/json",
        ...options.headers,
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (error) {
    const timeout =
      error instanceof Error &&
      /timeout|abort/i.test(error.name + error.message);
    throw new ServiceError(
      timeout ? "TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      timeout
        ? "The data provider took too long to respond. Try a smaller area or retry later."
        : "The data provider could not be reached. Check network access and try again.",
      timeout ? 504 : 502,
      `Required HTTPS host: ${new URL(url).hostname}`,
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ServiceError(
      response.status === 403 ? "NETWORK_BLOCKED" : "UPSTREAM_UNAVAILABLE",
      response.status === 403
        ? "The data provider or environment network policy denied this request."
        : `The data provider returned HTTP ${response.status}. Please try again later.`,
      502,
      `Required HTTPS host: ${new URL(url).hostname}`,
    );
  }
  const limit = options.maxBytes ?? 16 * 1024 * 1024;
  const length = Number(response.headers.get("content-length"));
  if (length > limit) {
    await response.body?.cancel();
    throw new ServiceError(
      "RESPONSE_TOO_LARGE",
      "This area contains too much data. Select a smaller area.",
    );
  }
  if (!response.body)
    throw new ServiceError(
      "NO_DATA",
      "The data provider returned an empty response.",
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.length;
      if (bytes > limit) {
        await reader.cancel();
        throw new ServiceError(
          "RESPONSE_TOO_LARGE",
          "This area contains too much data. Select a smaller area.",
        );
      }
      chunks.push(result.value);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      "INVALID_UPSTREAM_DATA",
      "The data provider returned an incomplete or invalid response.",
    );
  } finally {
    reader.releaseLock();
  }
}

export async function requestJson<T = unknown>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const bytes = await requestBytes(url, options);
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
  } catch {
    throw new ServiceError(
      "INVALID_UPSTREAM_DATA",
      "The data provider returned invalid JSON.",
    );
  }
}
