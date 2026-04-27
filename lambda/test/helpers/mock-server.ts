// Per-suite helper: boot the mock CodinGame server before tests run, shut it
// down after. Use via:
//
//   const ctx = useMockCodinGameServer();
//   ...
//   const client = new CodinGameClient({ baseUrl: ctx.baseUrl, ... });
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '@cgd/mock-codingame';

export interface MockServerContext {
  baseUrl: string;
}

export function useMockCodinGameServer(slowDelayMs = 50): MockServerContext {
  const ctx: MockServerContext = { baseUrl: '' };
  let server: Server | undefined;

  beforeAll(async () => {
    const app = createApp({ slowDelayMs });
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = (server!.address() as AddressInfo).port;
        ctx.baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
  });

  return ctx;
}
