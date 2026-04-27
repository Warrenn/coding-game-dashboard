// Browser SigV4 signer for the Lambda Function URL. Cognito-issued
// credentials sign every request; AWS_IAM auth on the URL means an
// unsigned request is rejected before our handler runs.
import { Sha256 } from '@aws-crypto/sha256-browser';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import type { AwsCredentialIdentity } from '@aws-sdk/types';

export interface FunctionUrlClientOptions {
  /** Full URL of the Lambda Function URL (e.g. https://abc.lambda-url.us-east-1.on.aws). */
  baseUrl: string;
  region: string;
  credentialsProvider: () => Promise<AwsCredentialIdentity>;
  fetchImpl?: typeof fetch;
}

export class FunctionUrlClient {
  private readonly origin: URL;
  private readonly region: string;
  private readonly getCreds: () => Promise<AwsCredentialIdentity>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FunctionUrlClientOptions) {
    this.origin = new URL(opts.baseUrl);
    this.region = opts.region;
    this.getCreds = opts.credentialsProvider;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async post(path: string, body: unknown): Promise<Response> {
    const credentials = await this.getCreds();
    const signer = new SignatureV4({
      service: 'lambda',
      region: this.region,
      credentials,
      sha256: Sha256,
    });

    const bodyText = JSON.stringify(body ?? {});
    const req = new HttpRequest({
      method: 'POST',
      protocol: this.origin.protocol,
      hostname: this.origin.hostname,
      path: path.startsWith('/') ? path : `/${path}`,
      headers: {
        host: this.origin.hostname,
        'content-type': 'application/json',
      },
      body: bodyText,
    });

    const signed = await signer.sign(req);

    const url = new URL(this.origin);
    url.pathname = signed.path;

    return this.fetchImpl(url.toString(), {
      method: signed.method,
      headers: signed.headers,
      body: signed.body as string,
    });
  }
}
