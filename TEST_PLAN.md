# Automated Test Strategy & Roadmap

> Target: **≥ 80 % overall statement coverage** across all packages (backend & frontend) by the end of Phase 3.

---
## 1. Current Context
- Monorepo managed with **npm workspaces**
- TypeScript everywhere (`apps/node-server`, `apps/web-client`, `packages/*`)
- **Jest** scaffolding already present for basic unit tests

Limitations found:
1. Jest configuration duplicated per-package, slow in monorepo mode
2. No browser-level tests – UI logic is untested
3. No systematic mocking for external services (SSH, GitHub CLI, WebSocket tunnelling)
4. Coverage < 20 %

---
## 2. Guiding Principles
1. **Fast feedback**: unit tests should run in < 5 s locally
2. **Real user flows**: E2E tests must cover the happy path *and* connection-failure flows
3. **Isolated backend**: network / CLI calls mocked to keep tests deterministic
4. **Single source of truth**: one shared configuration per tool in the repo root

---
## 3. Tooling Decisions
| Layer | Proposed Tooling | Rationale |
|-------|-----------------|-----------|
| Unit & Component tests | **Vitest** (+ `@testing-library/*`) | 2-3× faster than Jest, first-class TS + ESM support, Jest-compatible API (easy migration) |
| Mocking (backend) | **nock** | HTTP / WebSocket mocking with fine-grained expectations |
| Mocking (frontend) | **MSW** (Mock Service Worker) | Same mocks reused in Vitest & Playwright |
| API integration tests | **Supertest** | Minimal overhead to hit Express/Koa/etc. handlers in-process |
| UI E2E | **Playwright** | Cross-browser, parallel, good VS Code integration. Alternative: Cypress; chose Playwright for multi-tab support |
| Coverage | **c8/istanbul** via Vitest builtin | Accurate TS coverage with source-map support |
| Reporting | **Codecov** | Free for OSS, integrates with GitHub Actions |



---
### 3.1 Cypress vs Playwright
Both tools provide reliable browser automation. Because we only target **Chromium (headless)** and do not need multi-tab support, Cypress is a viable alternative. Key considerations:

| Criteria | Playwright | Cypress |
|----------|-----------|---------|
| WebSocket / streaming support | ✔️ Built-in `waitForEvent('websocket')`, can proxy WS traffic | ⚠️ WS works but requires `experimentalSessionAndOrigin` for cross-origin; some limitations around binary frames |
| Parallelism | ✔️ Native sharding w/o extra license | Paid parallelisation on Cypress Cloud (oss tier limited) |
| Auto-waiting | ✔️ Yes | ✔️ Yes |
| Visual regression add-ons | Playwright trace viewer + `@playwright/test-runner` snapshot; 3rd-party plugins | Many community plugins (Percy, Happo) – easier set-up |
| CI resources | Single Chromium download (~120 MB) | Electron bundled (~140 MB) |
| Licensing | MIT | MIT (runner) + AGPL (dashboard) |

**Conclusion:** If you value an all-in-one GUI and simpler learning curve, Cypress is acceptable, but Playwright remains superior for WebSocket heavy flows and free parallel execution.

---
### 3.2 Vitest vs Jest – beyond speed
1. **Native ES Modules** – zero babel/ts-jest; matches Vite dev-server behaviour → identical import paths.
2. **In-process Vite** – shares the same plugin pipeline (alias, env, CSS modules) → no config drift.
3. **Watch mode UX** – instant reruns, interactive filtering similar to Jest but faster due to ESBuild.
4. **Snapshot isolation** – powered by `tiny-bench` timers, deterministic.
5. **First-class TypeScript** – diagnostics surfaced inline via `ts-node/esm`.
6. **Plugin ecosystem** – re-use Vite plugins (e.g., SVG loaders) directly in tests.

---
### 3.3 Mock Service Worker placement
Option A – **Centralised** (`test/msw-handlers.ts`):
+ Single source, avoids duplication, easier to share between unit and E2E.
− Larger file can become unwieldy.

Option B – **Co-located** (next to package they mock):
+ Clear ownership & discoverability; mocks evolve with implementation.
− Risk of divergent mocks between packages.

**Recommendation:** keep core, cross-package mocks in `test/` and add thin, package-specific handlers next to each service when behaviour diverges.

---
### 3.4 Coverage reporting: Codecov vs Coveralls
| Feature | Codecov | Coveralls |
|---------|---------|-----------|
| VCS support | GitHub, GitLab, Bitbucket | GitHub, GitLab, Bitbucket |
| Status checks | ✅ Fine-grained per flag/path rules | ✅ Thresholds per project |
| Report merge | ✅ Combine multi-language & matrix runs | ⚠️ Basic parallel merge only |
| UI | Heat-maps, tree view, PR comments | Simple file list, PR comments |
| Free OSS limits | Unlimited public repos | Unlimited public repos |
| Enterprise self-host | ✅ | ✅ |
| Pricing private | 10 K lines free, then seats | Per-user seats |

Both integrate via a simple uploader action. **Codecov** offers more granular path rules and nicer UI; Coveralls is simpler but sufficient if you prefer minimalism.

---
## 4. Test Architecture
```
├── apps/
│   ├── node-server
│   │   └── __tests__   # unit + integration
│   └── web-client
│       └── __tests__   # component tests (Vitest + @testing-library/preact)
├── e2e/
│   └── *.spec.ts       # Playwright specs
├── test
│   ├── setup-vitest.ts # global mocks / aliases
│   └── msw-handlers.ts # shared MSW handlers
└── vitest.config.ts    # monorepo-aware config
```

- **Shared mocks** live under `test/` and are imported by both Vitest & Playwright (via `setupGlobalFixtures`)
- Playwright runs against built `web-client` served by dev server or `vite preview`

---
## 5. Coverage Targets & Gates
| Package | Metric | Threshold |
|---------|--------|-----------|
| apps/node-server | statements | 85 % |
| apps/web-client  | statements | 80 % |
| packages/*       | statements | 80 % |
| **Global**       | statements | 80 % (branch ≥ 70 %, lines ≥ 80 %) |

`vitest run --coverage` will fail CI if any threshold is missed.

---
## 6. Implementation Roadmap
### Phase 1 – Foundation (1 d)
1. Replace root Jest deps with `vitest`, `@vitest/coverage-c8`
2. Create `vitest.config.ts` with workspace glob: `['apps/**','packages/**']`
3. Add `test/setup-vitest.ts` to register "jsdom" env & MSW
4. Migrate existing Jest tests (`.test.ts`) – usually no code change needed

### Phase 2 – Backend Coverage (2–3 d)
1. **Unit**: focus on pure functions in `TunnelModule`, utils, state machines
2. **Integration**: use Supertest to hit REST/WebSocket endpoints without network
3. Mock external CLI (`gh`) calls via `execa` stub or `jest-mock-process`
4. Reach 70 % backend coverage

### Phase 3 – Frontend & E2E (3–4 d)
1. Component tests for Preact shell & Lit web-components (`@testing-library/preact` + `@testing-library/user-event`)
2. Integrate MSW handlers for WebSocket & REST mocks
3. Add Playwright with two main flows:
   - Successful Codespace connect/disconnect
   - Failure path: codespace *Starting* then retry
4. Upload HTML coverage report to CI artifact
5. Achieve ≥ 80 % global coverage

---
## 7. CI Integration (GitHub Actions)
The pipeline below represents the desired target state once the scaffold is merged.

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  build-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18]
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build packages
        run: npm run build --workspaces --if-present

      - name: Run unit/component tests with coverage
        run: npx vitest run --coverage

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npx playwright test --reporter=dot

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          flags: unit,e2e
          files: ./coverage/clover.xml
          fail_ci_if_error: true
```

- `ci.yml` workflow steps:
  1. `npm ci`
  2. `npm run build` (monorepo)
  3. `npx vitest run --coverage`
  4. `npx playwright install --with-deps`
  5. `npx playwright test`
  6. Upload coverage & Playwright trace artefacts

---
## 8. Responses to Open Questions
1. **Browser matrix** – **Chromium only** for now. CI workflow already pins Playwright to install Chromium-only.
2. **Visual regression** – Required. Analysis provided in Section 8.1.
3. **Fixture strategy** – No existing test data; proposal in Section 8.2.

---
### 8.1 Visual Regression: Playwright vs Storybook + Chromatic
| Criterion | Playwright Snapshots | Storybook + Chromatic |
|-----------|---------------------|-----------------------|
| Scope | Full-page screenshots during E2E flows | Component-level isolated stories |
| Review UI | Built-in HTML diff viewer in Playwright report | Chromatic cloud UI with per-story diffs + team comments |
| Parallel CI cost | Free (runs on existing runners) | Chromatic free tier 5k snapshots/mo, paid tiers after |
| Setup effort | ~3 lines: `expect(page).toHaveScreenshot()`; requires baseline commit | Need Storybook build + story files; push to Chromatic |
| Maintenance | Re-record baseline manually | Approve changes via Chromatic UI |
| Visual coverage | End-to-end screens only | Component matrix (states, themes) |

**Recommendation**: Start with **Playwright snapshots** for immediate coverage of primary flows (minimal setup). If granular component regression becomes important, layer Storybook + Chromatic later.

---
### 8.2 Fixture Strategy Proposal
Fixtures = deterministic test data used by MSW/nock to stub external interactions.

Structure:
```
└── test/fixtures
    ├── codespace-success.json           # Sample API response
    ├── websocket-frames.ndjson          # Recorded WS messages
    └── ssh-banner.txt                   # Static CLI output
```

Helpers (`test/fixture-utils.ts`) load JSON/ndjson and feed MSW/nock. Example:
```ts
import fs from 'node:fs/promises';
export async function loadFixture<T>(name: string): Promise<T> {
  const data = await fs.readFile(`test/fixtures/${name}`, 'utf8');
  return JSON.parse(data) as T;
}
```
MSW handler snippet:
```ts
import { rest } from 'msw';
import { loadFixture } from './fixture-utils';

export const handlers = [
  rest.get('/api/codespaces', async (_, res, ctx) => {
    const data = await loadFixture('codespace-success.json');
    return res(ctx.json(data));
  }),
];
```
This keeps fixtures version-controlled, reusable across unit/integration/E2E layers.

#### 8.2.1 Harvesting WebSocket Test Data
Capturing live WebSocket traffic lets us create realistic playback fixtures.

**Capture Approaches**
1. **Playwright tracing** – Run the flow once with `PWDEBUG=1` & `recordHar` enabled, then extract WS frames from the `.zip` trace (`resources/ws_frames.ndjson`).
2. **Browser DevTools** – Use Chrome DevTools → Network → WS tab, export messages as HAR and convert to ndjson via script.
3. **Proxy Recording** – Insert `mitmproxy` or `wiremock-websocket` in between client/server to auto-record frames.

**Storage Format**: newline-delimited JSON (`ndjson`) where each entry is `{ "direction": "outbound" | "inbound", "data": "<base64>" }` allowing binary frames.

**Playback Utility** (`test/ws-replay.ts`):
```ts
import { WebSocket } from 'ws';
import fs from 'node:fs';
export async function replayWs(server: WebSocket.Server, fixture = 'websocket-frames.ndjson') {
  const frames = fs.readFileSync(`test/fixtures/${fixture}`, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse);
  server.on('connection', (socket) => {
    for (const f of frames) {
      if (f.direction === 'inbound') socket.send(Buffer.from(f.data, 'base64'));
    }
  });
}
```
During tests, MSW/nock stubs HTTP, while `replayWs` feeds deterministic frames to the client.

---
## 9. Implementation Plan – Stub the Rig
The goal is to land an initial PR that wires up **Vitest**, **Playwright**, **MSW (central)** and **Codecov** without yet striving for high coverage.

### 9.1 File/Directory Additions
| Path | Purpose |
|------|---------|
| `vitest.config.ts` | Root Vitest config with `projects` glob to workspaces, JSDOM env, alias mapping from Vite |
| `test/setup-vitest.ts` | Registers MSW, JSDOM, global test utils |
| `test/msw-handlers.ts` | Shared request handlers for Codespace API, WebSocket stubs |
| `e2e/connection.spec.ts` | Playwright smoke test for connect/disconnect flow |
| `apps/node-server/__tests__/TunnelModule.test.ts` | Sample unit test using Vitest + nock |
| `apps/web-client/__tests__/App.test.tsx` | Component test using `@testing-library/preact` |
| `.github/workflows/ci.yml` | Pipeline as defined in Section 7 |
| `package.json` scripts | `"test:unit": "vitest", "test:e2e": "playwright test"` |

### 9.2 Tasks
1. Remove Jest dependencies from every `package.json`.
2. Add `vitest`, `@vitest/coverage-c8`, `@testing-library/preact`, `nock`, `msw`, `playwright` dev deps at root.
3. Create above files with minimal passing tests (e.g., expect(true).toBe(true)).
4. Generate `vitest.config.ts` with coverage thresholds off for now.
5. Commit CI workflow and ensure green run → Codecov receives first baseline.

---
## 10. Next Steps
The Implementation Plan & CI workflow are approved. Action items:
1. Generate scaffold PR implementing Section 9 tasks.
2. Ensure CI passes and Codecov baseline uploaded.
3. After merge, begin adding real tests & improve coverage by module.

---
*Prepared 2025-07-05*
