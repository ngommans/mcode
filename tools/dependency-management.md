# Dependency Management Guide

## Overview

This project uses several tools to ensure dependencies are up-to-date, secure, and consistent across all workspaces:

- **npm-check-updates (ncu)**: Check for and update to latest package versions
- **syncpack**: Ensure version consistency across workspaces
- **depcheck**: Find unused dependencies
- **audit-ci**: Security vulnerability scanning

## Quick Commands

```bash
# Check for dependency updates (non-destructive)
npm run deps:check

# Update dependencies interactively
npm run deps:update-interactive

# Update all dependencies automatically (use with caution)
npm run deps:update

# Find unused dependencies
npm run deps:unused

# Sync versions across workspaces
npm run deps:sync

# Run security audit
npm run deps:audit

# Run all dependency checks
npm run deps:all
```

## Tools Explained

### 1. npm-check-updates (ncu)

**Purpose**: Check for and update package versions to their latest releases.

**Configuration**: `.ncurc.json`
- Excludes Microsoft Dev Tunnels packages (pinned for stability)
- Focuses on major version updates
- Groups results by category

**Usage**:
```bash
# Check what can be updated
ncu

# Update package.json files
ncu -u

# Interactive mode
ncu -i

# Deep scan all workspaces
ncu --deep
```

### 2. Syncpack

**Purpose**: Ensure version consistency across monorepo workspaces.

**Configuration**: `.syncpackrc.json`
- Enforces workspace protocol for local packages
- Standardizes TypeScript, ESLint, and testing tool versions
- Groups related packages together

**Usage**:
```bash
# List version mismatches
syncpack list-mismatches

# Fix version mismatches
syncpack fix-mismatches

# List all packages
syncpack list
```

### 3. Depcheck

**Purpose**: Find unused dependencies.

**Configuration**: `.depcheckrc.json`
- Ignores type-only packages and build tools
- Scans TypeScript files properly
- Excludes test files and build directories

**Usage**:
```bash
# Find unused dependencies
depcheck

# Check specific directory
depcheck ./apps/web-client

# JSON output
depcheck --json
```

### 4. Audit CI

**Purpose**: Security vulnerability scanning.

**Configuration**: `.audit-ci.json`
- Checks all severity levels
- Includes dev dependencies
- Retry logic for network issues

**Usage**:
```bash
# Run security audit
audit-ci

# Audit with allowlist
audit-ci --allowlist CVE-2021-1234

# Skip dev dependencies
audit-ci --skip-dev
```

## Maintenance Workflow

### Weekly Dependency Maintenance

1. **Check for updates**:
   ```bash
   npm run deps:check
   ```

2. **Update interactively** (recommended):
   ```bash
   npm run deps:update-interactive
   ```

3. **Sync workspace versions**:
   ```bash
   npm run deps:sync
   ```

4. **Check for unused dependencies**:
   ```bash
   npm run deps:unused
   ```

5. **Run tests** after updates:
   ```bash
   npm test
   ```

6. **Commit changes** if tests pass

### Monthly Security Audit

1. **Run comprehensive audit**:
   ```bash
   npm run deps:audit
   ```

2. **Update vulnerable packages**:
   ```bash
   npm audit fix
   ```

3. **Review high/critical vulnerabilities manually**

### Before Major Releases

1. **Run full dependency check**:
   ```bash
   npm run deps:all
   ```

2. **Update to latest stable versions**:
   ```bash
   npm run deps:update
   ```

3. **Test thoroughly**:
   ```bash
   npm test
   npm run build
   ```

## Pinned Dependencies

Some dependencies are intentionally pinned:

- **Microsoft Dev Tunnels packages**: Pinned for API stability
- **TypeScript**: Pinned to ensure consistent compilation
- **ESLint/Prettier**: Pinned to ensure consistent code formatting

## Troubleshooting

### Version Conflicts

If you encounter version conflicts:

1. Run `npm run deps:sync` to fix workspace mismatches
2. Check `.syncpackrc.json` for version group rules
3. Manually resolve conflicts in package.json files

### Peer Dependency Warnings

1. Install missing peer dependencies:
   ```bash
   npm install --save-peer <package-name>
   ```

2. Or add to `.ncurc.json` reject list if not needed

### False Positives in depcheck

Add to `.depcheckrc.json` ignores array:
```json
{
  "ignores": ["package-name"]
}
```

## Best Practices

1. **Always test after updates**: Run tests and build processes
2. **Update incrementally**: Don't update everything at once
3. **Review breaking changes**: Check package changelogs
4. **Keep lockfiles**: Commit package-lock.json files
5. **Use exact versions for build tools**: Pin TypeScript, ESLint, etc.
6. **Regular maintenance**: Update dependencies weekly
7. **Security first**: Address vulnerabilities immediately