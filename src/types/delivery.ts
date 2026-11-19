import type { OutputDestination } from '@/constants/delivery.js';
import type { ReleaseOutcome } from '@/types/release.js';

/**
 * Backend-owned delivery metadata for PR creation.
 */
export type DeliveryMetadata = {
  /** PR title constructed by backend or provider. */
  title: string;
  /** PR body markdown. */
  body: string;
  /** GitHub issue/PR labels to apply. */
  labels: readonly string[];
  /** Target branch name (e.g. chore/changelog-v1.0.0). */
  branchName: string;
  /** Target repository owner. */
  owner: string;
  /** Target repository name. */
  repo: string;
  /** Base branch to target (e.g. main). */
  baseBranch: string;
};

/**
 * Payload passed from generation to delivery.
 */
export type GeneratedChangelog = {
  /** Selected delivery destination. */
  destination: OutputDestination;
  /** Post-processed release section Markdown including compare links. */
  releaseSectionMarkdown: string;
  /** Full updated changelog content. */
  updatedChangelog: string;
  /** Filesystem path to CHANGELOG.md. */
  changelogPath: string;
  /** Release version without the leading `v`. */
  version: string;
  /** GitHub token for authenticated write delivery. */
  token?: string;
  /** Backend delivery metadata. */
  deliveryMetadata: DeliveryMetadata;
  /** Typed validation outcome of release changes. */
  outcome?: ReleaseOutcome;
};

/**
 * Result returned after delivery completes.
 */
export type DeliveryResult =
  | {
      destination: 'pull-request';
      prNumber?: number;
      skipped: boolean;
      reason?: string;
    }
  | {
      destination: 'file';
      changelogPath: string;
      skipped: boolean;
      reason?: string;
    }
  | {
      destination: 'stdout';
      skipped: boolean;
      reason?: string;
    };
