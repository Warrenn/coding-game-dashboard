import { describe, expect, it } from '@jest/globals';
import { handler } from '../src/handler.js';

describe('lambda scaffold', () => {
  it('placeholder handler returns 501 until Step 6 lands', async () => {
    const result = await handler();
    expect(result.statusCode).toBe(501);
  });
});
