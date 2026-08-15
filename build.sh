#!/bin/bash
set -e

# ----------------------------
# Load NVM and Node for the tasksapp user
# ----------------------------
export NVM_DIR="/home/tasksapp/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20 || nvm install 20
export PATH="$(dirname $(which node)):$PATH"

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "PM2 version: $(pm2 -v)"

cd /home/tasksapp/public_html

# ----------------------------
# Box-specific secrets (JWT_SECRET, DATABASE_URL, AWS creds,
# S3_ATTACHMENTS_BUCKET, SES_FROM_EMAIL) -- never tracked in git. Lives
# only at /home/tasksapp/deploy-env.sh, created once by hand on this box.
# ----------------------------
[ -f /home/tasksapp/deploy-env.sh ] && . /home/tasksapp/deploy-env.sh

# ----------------------------
# Install dependencies. npm ci, not npm install: installs exactly what
# package-lock.json specifies -- this is also load-bearing here beyond the
# usual determinism reason, because better-sqlite3 and the Prisma query
# engine are native binaries that must be built for *this* box's exact
# Node/OS/arch, not just copied over from the CI container that built the
# zip.
# ----------------------------
echo "Installing npm dependencies (npm ci)..."
npm ci
npm audit signatures

# ----------------------------
# Regenerate the Prisma client against this box's native better-sqlite3
# build, then apply any pending migrations to the persistent database.
# DATABASE_URL (from deploy-env.sh) points at /home/tasksapp/data/tasks.db
# -- a path outside public_html, so it's never touched by ownership.sh's
# rm -rf and survives every redeploy.
# ----------------------------
mkdir -p /home/tasksapp/data
npx prisma generate
npx prisma migrate deploy

# ----------------------------
# Start PM2 process (scoped to this app's own name -- the tasksapp user
# runs nothing else, but naming it explicitly keeps intent clear and
# avoids ever accidentally affecting another app's PM2 daemon).
# ----------------------------
pm2 stop tasks-bubld-com || true
pm2 delete tasks-bubld-com || true
pm2 start ecosystem.config.js --update-env
pm2 save

echo "Deployment complete!"
