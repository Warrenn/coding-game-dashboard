#!/usr/bin/env bash
# Validate every CloudFormation template under infra/.
# Runs both `aws cloudformation validate-template` (syntax + capabilities) and
# `cfn-lint` (rules + best practices). Fails on the first error.
#
# Requires: aws CLI logged in (any profile that can call CFN ValidateTemplate),
#           cfn-lint (https://github.com/aws-cloudformation/cfn-lint).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATES=$(find "$ROOT/infra" -maxdepth 1 -name '*.yaml' -type f | sort)

if [ -z "$TEMPLATES" ]; then
  echo "No templates found under $ROOT/infra/." >&2
  exit 0
fi

PROFILE="${AWS_PROFILE:-busyweb}"
REGION="${AWS_REGION:-us-east-1}"

for tpl in $TEMPLATES; do
  echo "=== $(basename "$tpl") ==="
  aws cloudformation validate-template \
    --profile "$PROFILE" \
    --region "$REGION" \
    --template-body "file://$tpl" \
    >/dev/null
  cfn-lint "$tpl"
  echo "ok"
done

echo
echo "All templates validated."
