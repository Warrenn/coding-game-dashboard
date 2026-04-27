import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import { PaymentRequestNotifier } from '../src/notify.js';

const snsMock = mockClient(SNSClient);

beforeEach(() => snsMock.reset());

describe('PaymentRequestNotifier', () => {
  it('publishes to the configured topic', async () => {
    snsMock.on(PublishCommand).resolves({ MessageId: 'm1' });
    const notifier = new PaymentRequestNotifier('arn:aws:sns:us-east-1:0:t', new SNSClient({}));
    await notifier.publish({ subject: 'sub', message: 'msg' });
    const call = snsMock.commandCalls(PublishCommand)[0];
    expect(call.args[0].input.TopicArn).toBe('arn:aws:sns:us-east-1:0:t');
    expect(call.args[0].input.Subject).toBe('sub');
    expect(call.args[0].input.Message).toBe('msg');
  });

  it('truncates SNS Subject to 100 chars (SNS limit)', async () => {
    snsMock.on(PublishCommand).resolves({});
    const notifier = new PaymentRequestNotifier('arn', new SNSClient({}));
    await notifier.publish({ subject: 'x'.repeat(150), message: 'm' });
    const call = snsMock.commandCalls(PublishCommand)[0];
    expect(call.args[0].input.Subject).toHaveLength(100);
  });
});
