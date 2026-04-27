import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/server.js';

describe('mock-codingame scaffold', () => {
  it('responds to /health', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
