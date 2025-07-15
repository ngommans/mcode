import { describe, it, expect } from 'vitest';
import {
  GITHUB_CODESPACE_STATES,
  isGitHubCodespaceState,
  isRetryableCodespaceState,
  isAvailableCodespaceState,
} from '../src/schemas/github-codespace-api.js';

describe('GitHub Codespace API schema helpers', () => {
  const sample = GITHUB_CODESPACE_STATES[0];

  it('isGitHubCodespaceState validates enum members', () => {
    expect(isGitHubCodespaceState(sample)).toBe(true);
    expect(isGitHubCodespaceState('NotARealState')).toBe(false);
  });

  it('isRetryableCodespaceState matches subset', () => {
    expect(isRetryableCodespaceState('Provisioning')).toBe(true);
    expect(isRetryableCodespaceState('Available')).toBe(false);
  });

  it('isAvailableCodespaceState matches "Available" only', () => {
    expect(isAvailableCodespaceState('Available')).toBe(true);
    expect(isAvailableCodespaceState('Queued')).toBe(false);
  });
});
