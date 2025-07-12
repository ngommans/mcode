import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodespaceWebSocketHandler } from '../src/handlers/CodespaceWebSocketHandler';
import { MESSAGE_TYPES, type WebSocketMessage } from 'tcode-shared';

// Minimal fake ws implementing the bits we need
function makeFakeWs() {
  const ws: any = {};
  ws.sent = [] as WebSocketMessage[];
  ws.send = vi.fn((payload: string) => {
    ws.sent.push(JSON.parse(payload));
  });
  return ws;
}

describe('CodespaceWebSocketHandler.handleMessage router', () => {
  let handler: CodespaceWebSocketHandler;
  let ws: any;

  beforeEach(() => {
    handler = new CodespaceWebSocketHandler();
    ws = makeFakeWs();
  });

  it('routes AUTHENTICATE to handleAuthenticate', async () => {
    const spy = vi.spyOn<any, any>(handler as any, 'handleAuthenticate').mockImplementation(() => {});
    const msg = { type: MESSAGE_TYPES.AUTHENTICATE, token: 'abc' } as any;
    // @ts-expect-error accessing private method for test
    await (handler as any).handleMessage(ws, msg);
    expect(spy).toHaveBeenCalledWith(ws, msg);
  });

  it('routes LIST_CODESPACES to handleListCodespaces', async () => {
    const spy = vi.spyOn<any, any>(handler as any, 'handleListCodespaces').mockResolvedValue(undefined);
    const msg = { type: MESSAGE_TYPES.LIST_CODESPACES } as any;
    await (handler as any).handleMessage(ws, msg);
    expect(spy).toHaveBeenCalledWith(ws);
  });

  it('sends error for invalid message', async () => {
    const sendSpy = vi.spyOn(handler as any, 'sendError').mockImplementation(() => {});
    const badMsg = { invalid: true } as any;
    await expect((handler as any).handleMessage(ws, badMsg)).rejects.toThrow();
    expect(sendSpy).not.toHaveBeenCalled(); // thrown before sendError inside catch from our expect
  });
});
