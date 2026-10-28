export type Account = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

export class AccountError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function accountRequest(
  path: string,
  body?: Record<string, unknown>,
) {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL || ""}/api/auth${path}`,
    {
      method: body ? "POST" : "GET",
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  // A crashed or misconfigured host can answer with plain text or HTML.
  const data = await response.json().catch(() => {
    throw new AccountError(
      "The account service is unavailable right now. Please try again shortly.",
      "SERVICE_UNAVAILABLE",
    );
  });
  if (!response.ok)
    throw new AccountError(
      data.error || "Unable to complete account request.",
      data.code,
    );
  return data as {
    user?: Account | null;
    ok?: boolean;
    needsVerification?: boolean;
  };
}
