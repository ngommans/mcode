import { beforeAll, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './msw-handlers';

// Initialize MSW
const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterAll(() => server.close());
