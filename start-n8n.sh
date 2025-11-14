#!/bin/bash
cd /var/www/sanrico-mercantile

# Load environment variables from .env file
export $(cat .env | grep -v '^#' | xargs)

# Start n8n with environment variables
n8n start \
  --host="${N8N_HOST:-72.61.112.194}" \
  --port="${N8N_PORT:-5678}" \
  --protocol="${N8N_PROTOCOL:-http}" \
  --tunnel

