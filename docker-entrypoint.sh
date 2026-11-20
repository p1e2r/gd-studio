#!/bin/sh
# Starts as root only to make sure the data volume is writable, then drops to the "node" user.
set -e
DATA="${DATA_DIR:-/data}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA"
  if [ "$(stat -c %u "$DATA")" != "$(id -u node)" ]; then
    echo "Fixing ownership of $DATA for the node user"
    chown -R node:node "$DATA"
  fi
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
