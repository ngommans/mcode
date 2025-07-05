import { http, HttpResponse } from 'msw';
import { loadFixture } from './fixture-utils';

export const handlers = [
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok' });
  }),
  http.get('/api/codespaces', async () => {
    const data = await loadFixture('codespace-success.json');
    return HttpResponse.json(data as unknown as Record<string, unknown>);
  }),
];
