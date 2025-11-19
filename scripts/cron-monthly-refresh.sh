#!/bin/bash

# Directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Project root (assuming script is in /scripts)
PROJECT_ROOT="$SCRIPT_DIR/.."

# Load environment variables from .env file
if [ -f "$PROJECT_ROOT/.env" ]; then
    # Export variables, ignoring comments and empty lines
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | grep -v '^$' | xargs)
fi

# Check if CRON_SECRET is set
if [ -z "$CRON_SECRET" ]; then
    echo "Error: CRON_SECRET is not set in .env file"
    exit 1
fi

# Check if NEXT_PUBLIC_APP_URL is set, default to localhost:3000
APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"

# Execute the request
echo "[$(date)] Triggering monthly refresh at $APP_URL/api/cron/monthly-refresh..."
response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET "$APP_URL/api/cron/monthly-refresh" \
     -H "Authorization: Bearer $CRON_SECRET" \
     -H "Content-Type: application/json")

http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | grep -v "HTTP_STATUS")

if [ "$http_status" -eq 200 ]; then
    echo "Success: $body"
else
    echo "Failed (Status $http_status): $body"
    exit 1
fi
