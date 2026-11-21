#!/bin/bash
# ==============================================================================
# I-CASE Docker Performance & Resource Monitor (Bash)
# Periodic sampling of CPU, RAM, Network & Disk I/O across active containers.
# Outputs to CSV for performance and non-functional evaluation.
# ==============================================================================

OUTPUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/results"
OUTPUT_FILE="${OUTPUT_DIR}/docker-stats.csv"
INTERVAL_SECONDS=2

mkdir -p "${OUTPUT_DIR}"

# Escribir cabecera CSV si el archivo no existe o está vacío
if [ ! -s "${OUTPUT_FILE}" ]; then
  echo "Timestamp,Container,CPUPerc,MemUsage,MemPerc,NetIO,BlockIO" > "${OUTPUT_FILE}"
fi

echo "================================================================================"
echo "[I-CASE Monitor] Iniciando captura de métricas Docker..."
echo "[I-CASE Monitor] Intervalo de muestreo: ${INTERVAL_SECONDS} segundos"
echo "[I-CASE Monitor] Destino CSV: ${OUTPUT_FILE}"
echo "[I-CASE Monitor] Presiona [Ctrl + C] para finalizar el monitoreo."
echo "================================================================================"

cleanup() {
  echo ""
  echo "[I-CASE Monitor] Monitoreo detenido. Métricas guardadas en: ${OUTPUT_FILE}"
  exit 0
}

trap cleanup SIGINT SIGTERM

while true; do
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # docker stats --no-stream con formato estructurado
  STATS=$(docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" 2>/dev/null)
  
  if [ -n "$STATS" ]; then
    while IFS= read -r line; do
      if [ -n "$line" ]; then
        echo "${TIMESTAMP},${line}" >> "${OUTPUT_FILE}"
        echo "[${TIMESTAMP}] ${line}"
      fi
    done <<< "$STATS"
  else
    echo "[${TIMESTAMP}] Esperando contenedores activos..."
  fi
  
  sleep "${INTERVAL_SECONDS}"
done
