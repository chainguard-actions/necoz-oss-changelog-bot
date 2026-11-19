// Minimal commit shape used across utils and libs
export type CommitLite = {
  /** Short commit SHA returned by git log. */
  sha: string;
  /** Commit subject line used for changelog entries. */
  subject: string;
  /** Whether this commit explicitly declares a breaking change in subject or footer. */
  breaking?: true;
};
