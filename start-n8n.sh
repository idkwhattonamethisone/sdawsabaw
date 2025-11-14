#!/bin/bash
cd /var/www/sanrico-mercantile

# Load environment variables from .env file
export $(cat .env | grep -v '^#' | xargs)

# Set secure cookie to false for HTTP (set to true when using HTTPS)
export N8N_SECURE_COOKIE="${N8N_SECURE_COOKIE:-false}"

# Start n8n with environment variables
n8n start \
  --host="${N8N_HOST:-72.61.112.194}" \
  --port="${N8N_PORT:-5678}" \
  --protocol="${N8N_PROTOCOL:-http}" \
  --tunnel

