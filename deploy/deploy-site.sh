#!/bin/sh
set -eu

app_dir=/home/suiseikat/suieikat-site
release_dir=/home/suiseikat/suieikat-site-release

if [ "$release_dir" != "/home/suiseikat/suieikat-site-release" ]; then
  echo "Unexpected release directory" >&2
  exit 1
fi

rm -rf "$release_dir"
mkdir -p "$release_dir"
tar -xzf /tmp/suieikat-site-source.tar.gz -C "$release_dir"
if [ -f "$app_dir/.env" ]; then
  cp "$app_dir/.env" "$release_dir/.env"
  chmod 600 "$release_dir/.env"
fi
cd "$release_dir"
docker compose --env-file "$release_dir/.env" --project-name deploy -f deploy/compose.yaml up -d --build
