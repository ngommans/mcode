# Contributing to Minimal Terminal Client

First off, thank you for considering contributing! We welcome any and all contributions. This document provides guidelines to help you get started.

## Code of Conduct

This project and everyone participating in it is governed by a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please open an issue and provide a clear description, including steps to reproduce it.

### Suggesting Enhancements

If you have an idea for an enhancement, please open an issue to discuss it. This allows us to coordinate efforts and ensure the proposed changes align with the project's goals.

### Pull Requests

We welcome pull requests! Please follow these steps to submit your contribution:

1.  **Fork the repository** and create your branch from `main`.
2.  **Set up your development environment:**
    ```bash
    npm ci
    ```
3.  **Make your changes.** Ensure your code adheres to the existing style and conventions.
4.  **Run the development server** to test your changes locally:
    ```bash
    npm run dev
    ```
5.  **Ensure all tests, linting, and type checks pass:**
    ```bash
    npm run test
    npm run lint
    npm run typecheck
    ```
6.  **Commit your changes** using a descriptive commit message that follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format. This helps us automate changelogs and versioning.
    *   **Example:** `feat: Add new terminal theme option`
    *   **Example:** `fix: Correctly handle WebSocket disconnects`
7.  **Open a pull request** to the `main` branch. Provide a clear title and description of your changes.

## Development Workflow

*   **Run the app locally:** `npm run dev`
*   **Build for production:** `npm run build`
*   **Run unit tests:** `npm run test:unit`
*   **Run E2E tests:** `npm run test:e2e`
*   **Run all tests:** `npm run test`
*   **Lint code:** `npm run lint`
*   **Check types:** `npm run typecheck`

## Coding Style

We use **Prettier** for code formatting and **ESLint** for code analysis. These tools are configured to run automatically on commit, so you don't need to worry about formatting. Please ensure you have the recommended extensions for your editor to get real-time feedback.

Thank you for your contribution!
