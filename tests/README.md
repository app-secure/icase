# Suite de Pruebas No Funcionales: Rendimiento, Resiliencia y Recuperación (I-CASE)

Este directorio contiene la arquitectura y conjunto de pruebas automatizadas para la evaluación de los requerimientos no funcionales de la plataforma **I-CASE**: **RNF-01**, **RNF-02**, **RNF-06** y **RNF-09**, empleando **K6**, **Jest** y **Docker Stats**.

---

## 1. Matriz de Requerimientos No Funcionales (SLA)

| Requerimiento | Métrica / Alcance | Umbral SLA / Criterio de Éxito | Herramienta |
|---|---|---|---|
| **RNF-01: Rendimiento y Concurrencia** | Latencia p95 y tasa de error con carga creciente (hasta 50 VUs continuos y estrés a 75 VUs). | • $p(95) \le 3000\text{ ms}$<br>• $p(50) < 800\text{ ms}$<br>• Errores $5xx < 1\%$ | K6 (`01-load-endpoints.js`) |
| **RNF-02: Exportación por Tamaño** | Tiempo de generación y descarga de artefactos según volumen del proyecto (pequeño, mediano, grande). | • Pequeño: $p(95) < 1000\text{ ms}$<br>• Mediano: $p(95) < 3000\text{ ms}$<br>• Grande: $p(95) < 8000\text{ ms}$<br>• Integridad `status: 200` y `body > 0` | K6 (`02-export-sizes.js`) |
| **RNF-06: Generación con IA** | Medición de duración, telemetría de tokens y degradación controlada ante timeouts o cuotas. | • Tolerancia cero a caídas $500$<br>• Manejo controlado de $408$, $429$, $503$, $504$<br>• Registro de tokens consumidos | K6 (`03-ai-generation.js`) |
| **RNF-09: Resiliencia y Recuperación** | Continuidad ante fallos: fallback de proveedores, cancelación, reanudación y recuperación tras reinicio. | • 100% pruebas de resiliencia superadas<br>• Cero duplicación de artefactos<br>• Artefactos aprobados intactos tras reinicio | Jest (`recovery.spec.js`) |

---

## 2. Estructura del Directorio

```text
tests/
├── performance/
│   ├── config/
│   │   ├── thresholds.js           # Umbrales SLA parametrizados (RNF-01, RNF-02, RNF-06)
│   │   └── test-data.json          # 3 usuarios independientes (JWT) y 3 proyectos semilla (small, medium, large)
│   ├── scripts/
│   │   ├── 01-load-endpoints.js    # Concurrencia gradual (10 -> 25 -> 50 -> 75 VUs)
│   │   ├── 02-export-sizes.js      # Pruebas de exportación segmentadas por tamaño
│   │   └── 03-ai-generation.js     # Medición controlada de IA (duración, tokens, timeouts)
│   ├── monitor-docker.sh           # Monitor periódico de recursos Docker en CSV (Bash)
│   ├── monitor-docker.ps1          # Monitor periódico de recursos Docker en CSV (PowerShell)
│   └── results/
│       ├── .gitkeep                # Directorio de salida para reportes
│       ├── summary-load.json       # Resumen de carga (generado por K6)
│       ├── summary-export.json     # Resumen de exportación (generado por K6)
│       ├── summary-ai.json         # Resumen de IA (generado por K6)
│       └── docker-stats.csv        # Muestreo de CPU/RAM/Red/Disco
└── resilience/
    └── recovery.spec.js            # Suite Jest: Fallback IA, cancelación, checkpoints y reinicio
```

---

## 3. Prerrequisitos

1. **Node.js**: Versión 18 o superior.
2. **K6**: Instalado en el sistema operativo.
   - *Windows (Chocolatey / Winget)*: `winget install k6` o `choco install k6`
   - *Linux / WSL / macOS*: `sudo apt-get install k6` o `brew install k6`
3. **Docker**: Para monitoreo de contenedores (`docker stats`).
4. **Backend I-CASE en ejecución**:
   - Por defecto: `http://localhost:5000` (o `http://localhost:3000/api` en contenedores Docker).

---

## 4. Guía de Ejecución

### Paso 1: Iniciar el Monitoreo de Recursos Docker

Antes de iniciar las pruebas de carga, ejecuta el script de monitoreo en una terminal separada:

- **En Windows (PowerShell)**:
  ```powershell
  .\tests\performance\monitor-docker.ps1
  ```
- **En Linux / macOS (Bash)**:
  ```bash
  chmod +x ./tests/performance/monitor-docker.sh
  ./tests/performance/monitor-docker.sh
  ```

El script registrará cada 2 segundos en `tests/performance/results/docker-stats.csv`:
`Timestamp,Container,CPUPerc,MemUsage,MemPerc,NetIO,BlockIO`

---

### Paso 2: Ejecutar Pruebas de Carga y Concurrencia (RNF-01)

Evalúa la concurrencia gradual de 10 a 50 VUs (SLA) y estrés hasta 75 VUs sobre el listado de proyectos y consulta de artefactos:

```bash
# Apuntando al backend local en puerto 5000:
k6 run -e BASE_URL=http://localhost:5000 tests/performance/scripts/01-load-endpoints.js

# O en entorno Docker (puerto 3000):
k6 run tests/performance/scripts/01-load-endpoints.js
```

**Resultado generado**: `tests/performance/results/summary-load.json`.

---

### Paso 3: Ejecutar Pruebas de Exportación por Tamaño (RNF-02)

Evalúa la velocidad y descarga íntegra de artefactos (Markdown, Consolidado JSON, Paquete `.icase.json` y ZIPs de código) para proyectos `small`, `medium` y `large`:

```bash
k6 run -e BASE_URL=http://localhost:5000 tests/performance/scripts/02-export-sizes.js
```

**Resultado generado**: `tests/performance/results/summary-export.json`.

---

### Paso 4: Ejecutar Pruebas de Generación con IA (RNF-06)

Evalúa la latencia de procesamiento, consumo de tokens y degradación elegante ante timeouts ($408/504$) o saturación ($429/503$):

```bash
k6 run -e BASE_URL=http://localhost:5000 tests/performance/scripts/03-ai-generation.js
```

**Resultado generado**: `tests/performance/results/summary-ai.json`.

---

### Paso 5: Ejecutar Suite de Resiliencia y Recuperación (RNF-09)

Ejecuta las pruebas automatizadas con Jest desde la raíz del proyecto o desde `icase-backend`:

- **Desde la raíz del repositorio**:
  ```bash
  npm run test:resilience
  ```
- **Desde `icase-backend`**:
  ```bash
  cd icase-backend
  npm run test:resilience
  ```

**Casos evaluados**:
1. `Fallback de Proveedor IA`: Conmutación automática de Groq a Gemini ante errores 429/503 sin fallo para el usuario.
2. `Cancelación de Trabajos`: Liberación inmediata del `mutationLease` y aborto limpio de etapas posteriores vía `assertCurrent`.
3. `Interrupción y Reanudación`: Reutilización de checkpoints validados sin reenviar solicitudes a la IA y sin duplicar artefactos.
4. `Recuperación tras Reinicio`: Invariabilidad de artefactos aprobados y liberación de trabajos huérfanos (`requirementsRecover`).

---

## 5. Interpretación de Resultados

- **`http_req_duration p(95)`**: Si el valor es $\le 3000\text{ ms}$, se cumple el SLA de RNF-01.
- **`errors_5xx`**: Debe mantenerse en $0$ o $< 1\%$ del total de peticiones.
- **`export_integrity_success`**: Debe mantenerse en $> 95\%$ validando que no se descarguen archivos vacíos o corruptos.
- **`docker-stats.csv`**: Analizar las columnas `CPUPerc` y `MemUsage` para comprobar que ningún microservicio sature los límites del host o presente fugas de memoria (*memory leaks*).
