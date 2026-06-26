type FetchRetryOptions = {
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
};

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const { retries = 3, retryDelayMs = 500, timeoutMs = 15000 } = opts;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      lastError = e instanceof Error ? e : new Error(String(e));

      const isTimeout = lastError.name === "AbortError";
      const isNetwork = !isTimeout;

      // Do not retry on 4xx (client errors) — only network/timeout/5xx are retryable at fetch level.
      // We'll let the caller decide about HTTP status retries.
      const shouldRetry = attempt < retries && (isTimeout || isNetwork);
      if (!shouldRetry) break;

      const delay = retryDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError ?? new Error("Fetch failed after retries");
}
