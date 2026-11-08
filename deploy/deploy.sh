#!/usr/bin/env bash
# Deploys the hub to the Oracle server over SSH. Used by GitHub Actions and for manual deploys.
#   ORACLE_HOST         server IP or hostname (required)
#   ORACLE_SSH_KEY      private key that can SSH in (required)
#   ORACLE_USER         SSH user (default: ubuntu)
#   ORACLE_KNOWN_HOSTS  pinned known_hosts line(s); scanned on the fly when empty
#   HUB_HOST            public hostname (default: hub.129-159-8-242.sslip.io)
set -euo pipefail

: "${ORACLE_HOST:?ORACLE_HOST is required}" "${ORACLE_SSH_KEY:?ORACLE_SSH_KEY is required}"
ORACLE_USER=${ORACLE_USER:-ubuntu}
HUB_HOST=${HUB_HOST:-hub.129-159-8-242.sslip.io}
APP_DIR=/opt/apps/hub

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
printf '%s\n' "$ORACLE_SSH_KEY" >"$tmp/key"
chmod 600 "$tmp/key"
if [ -n "${ORACLE_KNOWN_HOSTS:-}" ]; then
  printf '%s\n' "$ORACLE_KNOWN_HOSTS" >"$tmp/known_hosts"
else
  ssh-keyscan -T 10 "$ORACLE_HOST" >"$tmp/known_hosts" 2>/dev/null
fi
remote() {
  ssh -i "$tmp/key" -o UserKnownHostsFile="$tmp/known_hosts" -o StrictHostKeyChecking=yes -o BatchMode=yes \
    "$ORACLE_USER@$ORACLE_HOST" "$@"
}

cd "$(dirname "$0")/.."
echo "Uploading to $ORACLE_USER@$ORACLE_HOST:$APP_DIR"
tar -czf - server.mjs Dockerfile .dockerignore public deploy/compose.yml | remote "
  set -e
  staging=\$(mktemp -d)
  tar -xzf - -C \"\$staging\"
  chmod 755 \"\$staging\"
  sudo rm -rf $APP_DIR.old
  if [ -d $APP_DIR ]; then sudo mv $APP_DIR $APP_DIR.old; fi
  sudo mv \"\$staging\" $APP_DIR
  sudo rm -rf $APP_DIR.old
"
echo "Building and starting the container"
remote "cd $APP_DIR/deploy && HUB_HOST='$HUB_HOST' docker compose up -d --build --remove-orphans && docker image prune -f >/dev/null"

echo "Waiting for https://$HUB_HOST"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "https://$HUB_HOST/healthz"; then
    echo "Live: https://$HUB_HOST"
    exit 0
  fi
  sleep 4
done
echo "Deployed, but https://$HUB_HOST/healthz did not answer within 2 minutes" >&2
exit 1
