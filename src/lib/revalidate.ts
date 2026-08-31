type RevalidationEnv = {
  FRONTEND_URL?: string;
  REVALIDATION_SECRET?: string;
};

export function notifyProductRevalidation(
  env: RevalidationEnv,
  waitUntil: (promise: Promise<unknown>) => void,
) {
  const frontendUrl = env.FRONTEND_URL?.replace(/\/$/, "");
  const secret = env.REVALIDATION_SECRET;

  if (!frontendUrl || !secret) {
    console.error(
      "Product revalidation is not configured. Set FRONTEND_URL and REVALIDATION_SECRET.",
    );
    return;
  }

  const request = fetch(`${frontendUrl}/api/revalidate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: "/" }),
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Frontend revalidation failed (${response.status}): ${body || "empty response"}`,
      );
    }
  });

  waitUntil(
    request.catch((error: unknown) => {
      console.error("Product revalidation request failed:", error);
    }),
  );
}
