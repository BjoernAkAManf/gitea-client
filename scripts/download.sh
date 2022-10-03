#!/usr/bin/env bash
set -e

GITEA_PORT=3000
LOG=background-gitea.log
OUTPUT=swagger.json

# Runs Gitea in the Background (Same as Docker File)
s6-svscan /etc/s6 >${LOG} 2>&1 </dev/null &

# Wait until the port is open
while ! netstat -tna | grep 'LISTEN\>' | grep -q ":${GITEA_PORT}\>"; do
  JOBS=$( jobs -r | wc -l )

  # Check at least one job is running
  if [ "$JOBS" -gt 0 ];
  then
    sleep 1
  else
    # Background Task does not exist anymore
    echo 'Background Task stopped unexpectedly'
    exit 1
  fi
done

# Downloads the Swagger File
curl -S -s -o "${OUTPUT}" localhost:${GITEA_PORT}/swagger.v1.json