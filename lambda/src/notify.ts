// SNS publish helper.
import { PublishCommand, type SNSClient } from '@aws-sdk/client-sns';

export interface PaymentRequestNotification {
  subject: string;
  message: string;
}

export class PaymentRequestNotifier {
  constructor(
    private readonly topicArn: string,
    private readonly sns: SNSClient,
  ) {}

  async publish(notif: PaymentRequestNotification): Promise<void> {
    await this.sns.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: notif.subject.slice(0, 100),
        Message: notif.message,
      }),
    );
  }
}
