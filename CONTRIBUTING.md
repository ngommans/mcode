# Contributing to Terminal Code (tcode)

First off, thank you for considering contributing! We welcome any and all contributions to help make `tcode` better. This document provides guidelines to help you get started.

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

*   **Reporting Bugs:** If you find a bug, please open an issue and provide a clear description, including steps to reproduce it.
*   **Suggesting Enhancements:** If you have an idea for an enhancement, please open an issue to discuss it. This allows us to coordinate efforts and ensure the proposed changes align with the project's goals.
*   **Pull Requests:** We welcome pull requests for bug fixes and approved enhancements.

---

## Development Setup

To get started with the development environment, please follow these steps:

1.  **Fork and Clone:** Fork the repository to your own GitHub account and then clone it to your local machine.
2.  **Install Dependencies:** This is a monorepo using npm workspaces. Install all dependencies from the root directory using `npm ci` for a clean, reproducible install.
    ```bash
    npm ci
    ```
3.  **Run the Development Server:** Start the development server, which will build the necessary packages and run the web client and backend server concurrently with hot-reloading.
    ```bash
    npm run dev
    ```
    *   The **Web Client** will be available at `http://localhost:8080`.
    *   The **Backend Server** will be running on `ws://localhost:3000`.

---

## Project Structure

The project is a monorepo organized into `apps` and `packages`. Before making significant changes, please familiarize yourself with the system's design by reading the [**ARCHITECTURE.md**](ARCHITECTURE.md) file.

*   `apps/web-client`: The Preact-based frontend PWA.
*   `packages/server`: The core backend Node.js library for managing connections.
*   `packages/standalone`: The distributable `npx` wrapper that serves the client and runs the backend on a single express server.
*   `packages/shared`: Shared TypeScript types and utilities.

---

## Testing

We use **Vitest** for unit/component testing and **Playwright** for end-to-end (E2E) testing.

*   **Run All Tests:**
    ```bash
    npm test
    ```
*   **Run Unit Tests (Vitest):**
    ```bash
    npm run test:unit
    ```
*   **Run E2E Tests (Playwright):**
    ```bash
    npm run test:e2e
    ```
*   **Run Tests for a Specific Workspace:**
    ```bash
    # Example: run tests only for the web-client
    npm test --workspace=apps/web-client
    ```

---

## Code Style & Linting

*   **Formatting:** We use **Prettier** for automatic code formatting. It is configured to run via a pre-commit hook, so you don't have to run it manually.
*   **Linting:** We use **ESLint** for code analysis. You can run the linter manually with:
    ```bash
    npm run lint
    ```
*   **Type Checking:** To ensure type safety, run the TypeScript compiler without emitting files:
    ```bash
    npm run typecheck
    ```

All of these checks are also part of a pre-commit hook to ensure code quality before it is committed.

---

## Submitting Changes

1.  Create a new branch for your feature or bugfix from the `main` branch.
2.  Make your changes, ensuring you follow the project's code style and conventions.
3.  Add or update tests as necessary to cover your changes.
4.  Ensure all tests and quality checks pass locally.
5.  Commit your changes using a descriptive commit message that follows the **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)** specification. Our repository enforces this using `commitlint`.
    *   **Examples:**
        *   `feat: Add a new theme selection dropdown`
        *   `fix(server): Gracefully handle tunnel connection errors`
        *   `docs(architecture): Update communication protocol diagram`
6.  Push your branch to your fork and open a pull request to the `main` branch of the original repository.
7.  Provide a clear title and a detailed description of your changes in the pull request.

Thank you for your contribution!