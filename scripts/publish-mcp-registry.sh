#!/usr/bin/env bash
# Publishes server.json to the official MCP registry for the given version.
# Runs in GitHub Actions only: it authenticates with the workflow's OIDC token.
set -euo pipefail

VERSION="${1:?usage: publish-mcp-registry.sh <version>}"
MCP_NAME="io.github.ProjectMakersDE/horizon-mcp"
PUBLISHER_VERSION="v1.8.1"

jq --arg v "$VERSION" '.version = $v | .packages[0].version = $v' server.json > server.tmp
mv server.tmp server.json

# The registry checks mcpName in the npm metadata, so the version must be visible on npm first.
for _ in $(seq 1 40); do
  [ "$(npm view "horizon-mcp@$VERSION" mcpName 2>/dev/null)" = "$MCP_NAME" ] && break
  sleep 15
done
if [ "$(npm view "horizon-mcp@$VERSION" mcpName 2>/dev/null)" != "$MCP_NAME" ]; then
  echo "horizon-mcp@$VERSION with mcpName $MCP_NAME is not visible on npm" >&2
  exit 1
fi

curl -sL "https://github.com/modelcontextprotocol/registry/releases/download/$PUBLISHER_VERSION/mcp-publisher_linux_amd64.tar.gz" | tar xz mcp-publisher
./mcp-publisher login github-oidc

# The registry answers with transient server errors now and then, so retry a few times.
for attempt in 1 2 3; do
  ./mcp-publisher publish && exit 0
  echo "publish attempt $attempt failed" >&2
  sleep $((attempt * 60))
done
exit 1
