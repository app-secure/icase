#!/bin/sh
set -eu
mkdir -p /data/icase-key
if [ ! -s /data/icase-key/keyfile ]; then
  umask 077
  openssl rand -base64 756 > /data/icase-key/keyfile
fi
chown -R mongodb:mongodb /data/icase-key
chmod 400 /data/icase-key/keyfile
exec /usr/local/bin/docker-entrypoint.sh mongod --replSet rs0 --bind_ip_all --keyFile /data/icase-key/keyfile
