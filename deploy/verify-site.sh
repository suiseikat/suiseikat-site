#!/bin/sh
set -eu

docker inspect suieikat-site --format '{{range .Mounts}}{{.Type}} {{.Name}} {{.Destination}}{{println}}{{end}}'
