#!/bin/bash
set -e

REMOTE="/domains/axislabs.co.uk/public_html/the-eggcountant"
source /Users/russparks/.openclaw/workspace/.secrets

echo "→ Building..."
npm run build

echo "→ Deploying assets first (before updating index.html)..."
lftp -u "$FTP_USER,$FTP_PASS" "$FTP_HOST" << LFTP
set ftp:ssl-allow no
set net:timeout 30

# 1. Upload assets (JS/CSS/images) — NOT index.html yet
mirror -R --exclude index.html dist/ ${REMOTE}/
put api/bootstrap.php -o ${REMOTE}/api/bootstrap.php
put api/data.php -o ${REMOTE}/api/data.php
put api/login.php -o ${REMOTE}/api/login.php
put api/logout.php -o ${REMOTE}/api/logout.php
put api/register.php -o ${REMOTE}/api/register.php
put api/session.php -o ${REMOTE}/api/session.php
put .htaccess -o ${REMOTE}/.htaccess

# 2. Fix permissions on everything uploaded
chmod 755 ${REMOTE}
chmod 755 ${REMOTE}/assets
chmod 755 ${REMOTE}/api
cd ${REMOTE}/assets
glob chmod 644 *
cd ${REMOTE}/api
glob chmod 644 *
cd ${REMOTE}
chmod 644 .htaccess
chmod 644 favicon.png

# 3. Only NOW swap in the new index.html (atomic-ish)
put dist/index.html -o ${REMOTE}/index.html
chmod 644 ${REMOTE}/index.html

bye
LFTP

echo "✓ Deployed."
