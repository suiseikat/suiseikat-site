#!/bin/sh
set -eu

cloudflared --version
systemctl show cloudflared \
  -p ActiveState \
  -p SubState \
  -p UnitFileState \
  -p MainPID
systemctl status cloudflared --no-pager --lines=20
