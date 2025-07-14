/**
 * GitHub Codespace API Schema
 * Based on: https://docs.github.com/en/rest/codespaces/codespaces?apiVersion=2022-11-28
 * 
 * This file contains the official GitHub API types and schemas that we can reference
 * to ensure our types stay in sync with the actual API responses.
 */

/**
 * All possible states for a GitHub Codespace according to the official API
 * Source: GitHub REST API v2022-11-28
 */
export const GITHUB_CODESPACE_STATES = [
  'Unknown',
  'Created', 
  'Queued',
  'Provisioning',
  'Available',
  'Awaiting',
  'Unavailable', 
  'Deleted',
  'Moved',
  'Shutdown',
  'Archived',
  'Starting',
  'ShuttingDown', 
  'Failed',
  'Exporting',
  'Updating',
  'Rebuilding'
] as const;

/**
 * GitHub API Codespace state type derived from the official schema
 */
export type GitHubCodespaceState = typeof GITHUB_CODESPACE_STATES[number];

/**
 * States that indicate a codespace is in progress and may become available
 */
export const RETRYABLE_STATES: readonly GitHubCodespaceState[] = [
  'Created',
  'Queued', 
  'Provisioning',
  'Starting'
] as const;

/**
 * States that indicate a codespace is ready for connection
 */
export const AVAILABLE_STATES: readonly GitHubCodespaceState[] = [
  'Available'
] as const;

/**
 * Simple User schema from GitHub API
 */
export interface GitHubSimpleUser {
  name?: string | null;
  email?: string | null;
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string | null;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
  starred_at?: string;
  user_view_type?: string;
}

/**
 * Minimal Repository schema from GitHub API
 */
export interface GitHubMinimalRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  owner: GitHubSimpleUser;
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  url: string;
  archive_url: string;
  assignees_url: string;
  blobs_url: string;
  branches_url: string;
  collaborators_url: string;
  comments_url: string;
  commits_url: string;
  compare_url: string;
  contents_url: string;
  contributors_url: string;
  deployments_url: string;
  downloads_url: string;
  events_url: string;
  forks_url: string;
  git_commits_url: string;
  git_refs_url: string;
  git_tags_url: string;
  git_url?: string;
  issue_comment_url: string;
  issue_events_url: string;
  issues_url: string;
  keys_url: string;
  labels_url: string;
  languages_url: string;
  merges_url: string;
  milestones_url: string;
  notifications_url: string;
  pulls_url: string;
  releases_url: string;
  ssh_url?: string;
  stargazers_url: string;
  statuses_url: string;
  subscribers_url: string;
  subscription_url: string;
  tags_url: string;
  teams_url: string;
  trees_url: string;
  clone_url?: string;
  mirror_url?: string | null;
  hooks_url: string;
  svn_url?: string;
  homepage?: string | null;
  language?: string | null;
  forks_count?: number;
  stargazers_count?: number;
  watchers_count?: number;
  size?: number;
  default_branch?: string;
  open_issues_count?: number;
  is_template?: boolean;
  topics?: string[];
  has_issues?: boolean;
  has_projects?: boolean;
  has_wiki?: boolean;
  has_pages?: boolean;
  has_downloads?: boolean;
  has_discussions?: boolean;
  archived?: boolean;
  disabled?: boolean;
  visibility?: string;
  pushed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
    triage?: boolean;
    pull?: boolean;
  };
  role_name?: string;
  temp_clone_token?: string;
  delete_branch_on_merge?: boolean;
  subscribers_count?: number;
  network_count?: number;
  license?: {
    key?: string;
    name?: string;
    spdx_id?: string;
    url?: string;
    node_id?: string;
  } | null;
  forks?: number;
  open_issues?: number;
  watchers?: number;
  allow_forking?: boolean;
  web_commit_signoff_required?: boolean;
  custom_properties?: Record<string, unknown>;
}

/**
 * Codespace Machine schema from GitHub API
 */
export interface GitHubCodespaceMachine {
  name: string;
  display_name: string;
  operating_system: string;
  storage_in_bytes: number;
  memory_in_bytes: number;
  cpus: number;
  prebuild_availability: 'none' | 'ready' | 'in_progress' | null;
}

/**
 * Git Status schema from GitHub API
 */
export interface GitHubGitStatus {
  ahead: number;
  behind: number;
  has_unpushed_changes: boolean;
  has_uncommitted_changes: boolean;
  ref: string;
}

/**
 * Complete GitHub Codespace schema as returned by the API
 */
export interface GitHubCodespace {
  id: number;
  name: string;
  display_name?: string | null;
  environment_id?: string | null;
  owner: GitHubSimpleUser;
  billable_owner: GitHubSimpleUser;
  repository: GitHubMinimalRepository;
  machine: GitHubCodespaceMachine | null;
  devcontainer_path?: string | null;
  prebuild?: boolean | null;
  created_at: string;
  updated_at: string;
  last_used_at: string;
  state: GitHubCodespaceState;
  url: string;
  git_status: GitHubGitStatus;
  location: 'EastUs' | 'SouthEastAsia' | 'WestEurope' | 'WestUs2';
  idle_timeout_minutes: number | null;
  web_url: string;
  machines_url: string;
  start_url: string;
  stop_url: string;
  publish_url?: string | null;
  pulls_url?: string | null;
  recent_folders: string[];
  runtime_constraints?: {
    allowed_port_privacy_settings?: string[] | null;
  };
  pending_operation?: boolean | null;
  pending_operation_disabled_reason?: string | null;
  idle_timeout_notice?: string | null;
  retention_period_minutes?: number | null;
  retention_expires_at?: string | null;
  last_known_stop_notice?: string | null;
}

/**
 * List codespaces API response
 */
export interface GitHubListCodespacesResponse {
  total_count: number;
  codespaces: GitHubCodespace[];
}

/**
 * Get codespace API response (individual codespace with connection info)
 */
export interface GitHubGetCodespaceResponse extends GitHubCodespace {
  connection?: {
    tunnelProperties?: unknown;
    [key: string]: unknown;
  };
}

/**
 * Type guards for GitHub API responses
 */
export function isGitHubCodespaceState(value: unknown): value is GitHubCodespaceState {
  return typeof value === 'string' && GITHUB_CODESPACE_STATES.includes(value as GitHubCodespaceState);
}

export function isRetryableCodespaceState(state: GitHubCodespaceState): boolean {
  return RETRYABLE_STATES.includes(state);
}

export function isAvailableCodespaceState(state: GitHubCodespaceState): boolean {
  return AVAILABLE_STATES.includes(state);
}

export function isGitHubCodespace(obj: unknown): obj is GitHubCodespace {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  
  const codespace = obj as Record<string, unknown>;
  return (
    typeof codespace.id === 'number' &&
    typeof codespace.name === 'string' &&
    typeof codespace.state === 'string' &&
    isGitHubCodespaceState(codespace.state) &&
    typeof codespace.repository === 'object' &&
    codespace.repository !== null
  );
}