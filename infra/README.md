# infra

CloudFormation templates land in Steps 3–5 of STRATEGY.md:

- `storage-identity.yaml` — DynamoDB + Cognito Identity Pool + IAM roles
- `hosting.yaml` — S3 + CloudFront + response-headers policy
- `lambda-sns.yaml` — Lambda + Function URL + SNS

All deploys target `us-east-1`. The deploy script (Step 14) wires them as a
single nested stack so one `aws cloudformation deploy` call provisions
everything.
