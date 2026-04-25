#!/usr/bin/env bash
# End-to-end deploy of the coding-game-dashboard stack.
#
# Usage:
#   PAYER_EMAIL=you@example.com \
#   PLAYER_EMAIL=player@example.com \
#   GOOGLE_CLIENT_ID=optional.apps.googleusercontent.com \
#   ./scripts/deploy.sh
#
# Steps:
#   1. Validate templates
#   2. Deploy storage-identity stack (DDB + Cognito + IAM roles)
#   3. Deploy hosting stack (S3 + CloudFront + response headers)
#   4. Deploy lambda-sns stack (Lambda + Function URL + SNS)
#   5. Build the Lambda bundle and upload via update-function-code
#   6. Build the web bundle with VITE_* env vars from CFN outputs
#   7. Sync web/dist to S3 and invalidate CloudFront
#   8. Print the CloudFront URL and remaining manual steps

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROFILE="${AWS_PROFILE:-busyweb}"
REGION="${AWS_REGION:-us-east-1}"
APP="${APP_NAME:-coding-game-dashboard}"

PAYER_EMAIL="${PAYER_EMAIL:-}"
PLAYER_EMAIL="${PLAYER_EMAIL:-}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-REPLACE_BEFORE_AUTH_USE}"

if [ -z "$PAYER_EMAIL" ] || [ -z "$PLAYER_EMAIL" ]; then
  echo "ERROR: PAYER_EMAIL and PLAYER_EMAIL must be set." >&2
  exit 1
fi

run() { echo "+ $*" >&2; "$@"; }

aws_ () { run aws --profile "$PROFILE" --region "$REGION" "$@"; }

cfn_output() {
  local stack="$1" key="$2"
  aws_ cloudformation describe-stacks --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" \
    --output text
}

echo "=== 1. Validate templates ==="
"$ROOT/scripts/validate-cfn.sh"

echo "=== 2. Deploy storage-identity ==="
aws_ cloudformation deploy \
  --stack-name "$APP-storage-identity" \
  --template-file infra/storage-identity.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    AppName="$APP" \
    PayerEmail="$PAYER_EMAIL" \
    PlayerEmail="$PLAYER_EMAIL" \
    GoogleClientId="$GOOGLE_CLIENT_ID"

LEDGER_TABLE=$(cfn_output "$APP-storage-identity" LedgerTableName)
LEDGER_ARN=$(cfn_output "$APP-storage-identity" LedgerTableArn)
IDENTITY_POOL=$(cfn_output "$APP-storage-identity" IdentityPoolId)
echo "    LEDGER_TABLE=$LEDGER_TABLE"
echo "    IDENTITY_POOL=$IDENTITY_POOL"

echo "=== 3. Deploy hosting ==="
aws_ cloudformation deploy \
  --stack-name "$APP-hosting" \
  --template-file infra/hosting.yaml \
  --parameter-overrides AppName="$APP"

STATIC_BUCKET=$(cfn_output "$APP-hosting" StaticBucketName)
DIST_ID=$(cfn_output "$APP-hosting" DistributionId)
DIST_DOMAIN=$(cfn_output "$APP-hosting" DistributionDomainName)
echo "    STATIC_BUCKET=$STATIC_BUCKET"
echo "    DIST_ID=$DIST_ID"
echo "    DIST_DOMAIN=$DIST_DOMAIN"

echo "=== 4. Deploy lambda-sns ==="
aws_ cloudformation deploy \
  --stack-name "$APP-lambda-sns" \
  --template-file infra/lambda-sns.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    AppName="$APP" \
    PayerEmail="$PAYER_EMAIL" \
    LedgerTableName="$LEDGER_TABLE" \
    LedgerTableArn="$LEDGER_ARN" \
    AllowedOrigin="https://$DIST_DOMAIN"

LAMBDA_NAME=$(cfn_output "$APP-lambda-sns" FetcherFunctionName)
LAMBDA_URL=$(cfn_output "$APP-lambda-sns" FetcherUrl)
echo "    LAMBDA_NAME=$LAMBDA_NAME"
echo "    LAMBDA_URL=$LAMBDA_URL"

echo "=== 5. Build + upload Lambda code ==="
npm --prefix lambda run build
(
  cd lambda/dist
  zip -q -j handler.zip handler.mjs
)
aws_ lambda update-function-code \
  --function-name "$LAMBDA_NAME" \
  --zip-file "fileb://lambda/dist/handler.zip" \
  >/dev/null
echo "    lambda code uploaded"

echo "=== 6. Build web with CFN-output env vars ==="
LAMBDA_URL_HOST=$(echo "$LAMBDA_URL" | sed -E 's#https?://([^/]+)/?.*#\1#')
VITE_AWS_REGION="$REGION" \
VITE_COGNITO_IDENTITY_POOL_ID="$IDENTITY_POOL" \
VITE_PAYER_EMAIL="$PAYER_EMAIL" \
VITE_PLAYER_EMAIL="$PLAYER_EMAIL" \
VITE_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
VITE_LEDGER_TABLE="$LEDGER_TABLE" \
VITE_LAMBDA_URL="$LAMBDA_URL" \
  npm --prefix web run build
echo "    web bundle built (web/dist)"

echo "=== 7. Sync web bundle to S3 ==="
aws_ s3 sync web/dist "s3://$STATIC_BUCKET/" --delete
echo "=== Invalidate CloudFront ==="
aws_ cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' --output text

echo
echo "==============================================================="
echo "Deploy complete."
echo
echo "Site URL:        https://$DIST_DOMAIN"
echo "Lambda URL:      $LAMBDA_URL  (AWS_IAM auth, SigV4 required)"
echo "Identity Pool:   $IDENTITY_POOL"
echo "Ledger table:    $LEDGER_TABLE"
echo
if [ "$GOOGLE_CLIENT_ID" = "REPLACE_BEFORE_AUTH_USE" ]; then
  echo "WARNING: GoogleClientId is the placeholder. Sign-in will fail."
  echo "         Provision a Google OAuth Web Client and update both"
  echo "         the storage-identity stack parameter AND the web bundle"
  echo "         (re-run this script with GOOGLE_CLIENT_ID set)."
fi
echo "Confirm the SNS subscription email sent to $PAYER_EMAIL."
echo "==============================================================="
