#!/usr/bin/env bash
# Regenera backend y frontend del restaurante en ../salida-restaurante conservando .env y node_modules, y vacía su base de datos.
set -e
cd "$(dirname "$0")/.."
PID="$1"
cp ../salida-restaurante/backend/.env /tmp/rest-backend.env
rm -rf ../salida-restaurante/backend/src ../salida-restaurante/frontend/src ../salida-restaurante/mobile/*.js
JWT_SECRET=x-dev-secret-0123456789 DRY_CONFIRM_DERIVED=1 node scripts/_dry-generate.cjs "$PID" ../salida-restaurante | grep -E "archivos|FALL" 
cp /tmp/rest-backend.env ../salida-restaurante/backend/.env
docker exec rest-pg psql -q -U app -d app -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null
sed -i "s/localhost:3000/localhost:3400/g" ../salida-restaurante/frontend/vite.config.js
sed -i "s#^CORS_ORIGINS=.*#CORS_ORIGINS=http://localhost:5400,http://localhost:5401,http://localhost:8080,http://localhost:5173#" ../salida-restaurante/backend/.env
