import { z } from 'zod';
// WHY: Validate GitHub API responses at runtime to guard against shape drift.
export const GitHubReleaseByTagSchema = z.object({
    body: z.string().optional(),
});
export const GitHubPRInfoSchema = z.object({
    number: z.number().optional(),
    title: z.string().optional(),
    body: z.string().nullable().optional(),
    user: z
        .object({
        login: z.string().optional(),
    })
        .optional(),
    html_url: z.string().optional(),
});
export const GitHubCommitPullsItemSchema = z.object({
    number: z.number(),
    title: z.string().optional(),
    user: z
        .object({
        login: z.string().optional(),
    })
        .optional(),
    html_url: z.string().optional(),
});
export const GitHubCommitPullsArraySchema = z.array(GitHubCommitPullsItemSchema);
// Additional schemas for GitHub App installation/token exchange
export const GitHubInstallationSchema = z.object({
    id: z.number(),
});
export const GitHubAccessTokenSchema = z.object({
    token: z.string(),
    expires_at: z.string(),
});
