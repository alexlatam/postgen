export type PublishResult = { ok: true } | { ok: false; error: string };

export async function publishToLinkedIn(
  text: string,
  accessToken: string,
  personId: string
): Promise<PublishResult> {
  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      author: `urn:li:person:${personId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  if (response.ok) {
    return { ok: true };
  }

  const error = await response.text();
  return { ok: false, error };
}
