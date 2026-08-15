#!/bin/bash
# Direct deploy, run from a developer machine -- there is no Bitbucket
# pipeline or CodePipeline in this project's deploy path. This script runs
# the full quality gate (tsc, lint, unit tests, audit) and ships SOURCE
# only; it deliberately does NOT run `next build` here. build.sh (the
# CodeDeploy hook that runs on the box) does its own `npm ci` and
# `next build` there -- required, not optional, because better-sqlite3 and
# the Prisma query engine are native binaries, and Next.js's build-time
# file tracing snapshots whatever native binaries are installed at build
# time into .next/. Building anywhere but the exact deploy target embeds a
# binary for the wrong OS/arch, which then fails at runtime the moment a
# route touches the database (seen once already: "invalid ELF header"
# from a macOS-built better-sqlite3 binary loaded on the Linux box).
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

APPLICATION_NAME="tasks-bubld-com"
DEPLOYMENT_GROUP="tasks-bubld-com-deployment"
S3_BUCKET="bubld-tasks-deploy-artifacts"
S3_KEY="tasks-bubld-com/$(date +%Y%m%d%H%M%S).zip"
REGION="us-east-1"

echo "==> Installing dependencies"
npm ci
npx prisma generate

echo "==> Quality gate (tsc, lint, unit tests, package audit)"
npx tsc --noEmit
npm run lint
npm run test
npm audit signatures
npm audit --omit=dev --audit-level=high

echo "==> Packaging artifact (source only -- the box builds it)"
ZIP_PATH="$(mktemp -t tasks-bubld-com-XXXX).zip"
zip -r -q "$ZIP_PATH" . \
  -x "node_modules/*" \
  -x ".next/*" \
  -x ".git/*" \
  -x ".env*" \
  -x "*.db" \
  -x "coverage/*" \
  -x "test-results/*" \
  -x "playwright-report/*" \
  -x "scripts/*"

echo "==> Uploading to s3://$S3_BUCKET/$S3_KEY"
aws s3 cp "$ZIP_PATH" "s3://$S3_BUCKET/$S3_KEY" --region "$REGION"
rm -f "$ZIP_PATH"

echo "==> Triggering CodeDeploy"
DEPLOYMENT_ID=$(aws deploy create-deployment \
  --application-name "$APPLICATION_NAME" \
  --deployment-group-name "$DEPLOYMENT_GROUP" \
  --s3-location "bucket=$S3_BUCKET,key=$S3_KEY,bundleType=zip" \
  --file-exists-behavior OVERWRITE \
  --region "$REGION" \
  --query "deploymentId" --output text)

echo "==> Deployment $DEPLOYMENT_ID started, waiting for completion..."
aws deploy wait deployment-successful --deployment-id "$DEPLOYMENT_ID" --region "$REGION"
echo "==> Deployment succeeded: $DEPLOYMENT_ID"
