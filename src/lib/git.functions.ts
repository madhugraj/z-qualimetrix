import { createServerFn } from "@tanstack/react-start";

export const getGitStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { gitProviderStatus } = await import("./git.server");
  return gitProviderStatus();
});

export const getRepoInsights = createServerFn({ method: "GET" })
  .inputValidator((input: { provider: "github" | "gitlab"; repo: string }) => {
    const repo = String(input.repo ?? "").trim().replace(/^\/|\/$/g, "");
    if (!repo || !repo.includes("/")) throw new Error("Repository must look like owner/name.");
    if (input.provider !== "github" && input.provider !== "gitlab")
      throw new Error("Unsupported provider.");
    return { provider: input.provider, repo };
  })
  .handler(async ({ data }) => {
    const { githubInsights, gitlabInsights } = await import("./git.server");
    try {
      if (data.provider === "github") {
        const [owner, ...rest] = data.repo.split("/");
        return { ok: true as const, data: await githubInsights(owner, rest.join("/")) };
      }
      return { ok: true as const, data: await gitlabInsights(data.repo) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
