import { jest } from '@jest/globals';
import { FunctionUrlClient } from '../../src/data/function-url.js';

function fakeResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => '',
    json: async () => ({}),
  } as unknown as Response;
}

describe('FunctionUrlClient', () => {
  it('signs requests with SigV4 and POSTs JSON body', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse(200));
    const client = new FunctionUrlClient({
      baseUrl: 'https://abc.lambda-url.us-east-1.on.aws',
      region: 'us-east-1',
      credentialsProvider: async () => ({
        accessKeyId: 'AKIAFAKEFAKEFAKE',
        secretAccessKey: 'fake-secret',
        sessionToken: 'fake-session-token',
      }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await client.post('/snapshot', { hello: 'world' });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://abc.lambda-url.us-east-1.on.aws/snapshot');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    // SigV4 contributes these headers — exact value differs per request.
    expect(headers['authorization']).toMatch(/^AWS4-HMAC-SHA256/);
    expect(headers['authorization']).toContain('lambda');
    expect(headers['x-amz-date']).toBeDefined();
    expect(headers['x-amz-security-token']).toBe('fake-session-token');
    expect(headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['content-type']).toBe('application/json');

    expect(init.body).toBe('{"hello":"world"}');
  });

  it('normalises a path that does not start with /', async () => {
    const fetchImpl = jest.fn(async () => fakeResponse(200));
    const client = new FunctionUrlClient({
      baseUrl: 'https://abc.lambda-url.us-east-1.on.aws',
      region: 'us-east-1',
      credentialsProvider: async () => ({
        accessKeyId: 'AKIAFAKEFAKEFAKE',
        secretAccessKey: 'fake-secret',
      }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.post('snapshot', {});
    const [url] = (fetchImpl as jest.Mock).mock.calls[0] as [string];
    expect(url).toBe('https://abc.lambda-url.us-east-1.on.aws/snapshot');
  });
});
