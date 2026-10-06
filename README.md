# 🛠️ I-CASE: Plataforma Inteligente de Ingeniería de Software

I-CASE es una herramienta asistida por Inteligencia Artificial (Google Gemini) diseñada para convertir ideas, audios de reuniones, documentos PDF o notas de texto en un **documento técnico formal de software y arquitectura completa** en pocos segundos.

> **Trabajo paralelo de diagramas:** antes de implementar nuevos generadores o modificar el flujo de aprobación, consulta el [contrato de generación de diagramas](docs/diagram-generation-contract.md). Allí se definen los tipos oficiales, sus dependencias y la compatibilidad con proyectos existentes.

---

## 💡 ¿Cómo funciona la aplicación? 

El flujo de trabajo utiliza aprobaciones manuales y consta de 5 pasos:

1. **Ingreso de Insumos:**
   * Subes uno o varios archivos: grabaciones de voz/audios de entrevistas (`.mp3`, `.m4a`, `.wav`), documentos (`.pdf`) o escribes texto directamente en el panel.
   * El sistema extrae el texto automáticamente (usando transcripción con IA en audios y lectura de texto en PDFs).

2. **Análisis de Requisitos con IA:**
   * La IA analiza la información y define el **nombre del proyecto**, **objetivos** y **palabras clave del negocio**.
   * Genera los **Requerimientos Funcionales (RF)** en formato formal y los **Requerimientos No Funcionales (RNF)** con métricas cuantitativas medibles (estándar IEEE 830).

3. **Generación Autónoma de Diagramas y Arquitectura:**
   * La IA genera 4 diagramas técnicos en código **PlantUML**:
     - **Casos de Uso:** Muestra los actores y las operaciones principales del sistema.
     - **Arquitectura C4 (Contenedores):** La IA selecciona el stack tecnológico más adecuado para el proyecto (móvil, web, tipo de base de datos, APIs) en lugar de usar uno fijo.
     - **Clases del Dominio:** Entidades con atributos tipados y relaciones de datos.
     - **Árbol de Navegación (WBS):** Estructura jerárquica de pantallas y módulos de la solución.
   * Cada diagrama incluye su explicación operativa de cómo funciona el sistema.

4. **Mockups de Interfaz:**
   * La pestaña de mockups se habilita únicamente después de aprobar los cuatro diagramas.
   * La generación se ejecuta como un trabajo persistente; cambiar de pestaña no la cancela y los clics repetidos reutilizan el trabajo activo.
   * Los mockups se revisan y aprueban como una fase independiente.

5. **Documento Formal y Exportación a PDF:**
   * El documento consolidado se habilita únicamente después de aprobar los mockups.
   * Puedes revisar el documento formal en la web o abrir el visor de **PDF formal listo para entrega** y descargarlo con un solo clic.

---

## 🚀 Guía para Levantar el Proyecto

### Requisitos Previos
* **Node.js** (versión 18 o superior recomendada).
* **MongoDB** instalado y corriendo localmente en el puerto por defecto (`mongodb://127.0.0.1:27017/icase_db`), o una URL de MongoDB Atlas.

---

### Paso 1: Levantar el Backend (`icase-backend`)

Abre una terminal y ejecuta:

```bash
# 1. Entrar a la carpeta del backend
cd icase-backend

# 2. Descargar e instalar las librerías
npm install

# 3. Iniciar el servidor en modo desarrollo
npm run dev
```

El backend se iniciará en **`http://localhost:5000`**.

#### 📦 Arquitectura Multi-IA y Librerías del Backend:
Al ejecutar `npm install` se descargan las librerías necesarias para el sistema:
* **`express`**: Servidor web y creación de las rutas API REST.
* **`mongoose`**: Conexión y gestión de la base de datos MongoDB.
* **`axios`**: Cliente HTTP para integración resiliente con APIs de Inteligencia Artificial (**DeepSeek API**, **Google Gemini**, **Groq Cloud**).
* **`multer`**: Para recibir y procesar la subida de insumos (audios, PDFs, archivos de texto).
* **`pdf-parse`**: Para extracción directa de texto de documentos PDF.
* **`cors`**: Manejo de políticas de origen cruzado entre frontend y backend.
* **`dotenv`**: Gestión segura de variables de entorno e identidades de proveedores de IA.

---

### 🤖 Configuración y Orquestación Multi-IA (DeepSeek API + Google Gemini)

El proyecto soporta **Orquestación Híbrida Inteligente** (*Smart Routing & Failover*):

1. **DeepSeek API (`deepseek-chat` / `deepseek-reasoner`)**: Modelo principal de pago/consumo por tokens. Proporciona máxima precisión analítica en requerimientos IEEE 830 y generación JSON estructurada a bajo costo.
2. **Google Gemini**: Motor multimodal para ingesta y generación. Los modelos de mockups se configuran mediante `GEMINI_MOCKUP_MODELS`, evitando depender de identificadores retirados en el código.
3. **Groq Cloud / OpenAI / OpenRouter**: Fallback secundario ultra-rápido para redundancia en alta disponibilidad.

Para cambiar de proveedor en `.env`:
```env
AI_PROVIDER=deepseek    # Opciones: 'deepseek', 'gemini', 'groq', 'auto'
DEEPSEEK_API_KEY=tu_clave_deepseek
DEEPSEEK_MODEL=deepseek-chat
GEMINI_API_KEY=tu_clave_gemini
GEMINI_MOCKUP_MODELS=gemini-3.5-flash-lite,gemini-3.8-flash
GEMINI_ANALYSIS_MODELS=gemini-3.5-flash-lite,gemini-3.8-flash
GEMINI_INGESTION_MODELS=gemini-3.5-flash-lite,gemini-3.8-flash
GROQ_ANALYSIS_MODELS=openai/gpt-oss-120b
GROQ_WHISPER_MODEL=whisper-large-v3-turbo
```

Los catálogos de análisis, ingesta y mockups se configuran desde el entorno. Los proveedores sin credenciales, modelos retirados o servicios temporalmente limitados se omiten mediante circuit breaker, sin recorrer listas antiguas ni repetir llamadas inútiles.


---

### Paso 2: Levantar el Frontend (`icase-frontend`)

Abre **otra terminal diferente** y ejecuta:

```bash
# 1. Entrar a la carpeta del frontend
cd icase-frontend

# 2. Descargar e instalar las librerías
npm install

# 3. Iniciar la aplicación web
npm run dev
```

El frontend se iniciará en **`http://localhost:5173`**.

#### 📦 Librerías principales del Frontend:
Al ejecutar `npm install` se descargan las siguientes librerías:
* **`react`** y **`react-dom`**: Biblioteca base para la interfaz de usuario reactiva.
* **`vite`**: Herramienta de compilación rápida para desarrollo local.
* **`tailwindcss`**: Estilos visuales modernos y diseño responsivo.
* **`jspdf`**: Generador del documento PDF formal en el navegador.
* **`lucide-react`**: Iconografía moderna y minimalista de la interfaz.

---

## 🖥️ ¿Cómo usar la aplicación una vez levantada?

1. Abre tu navegador en **`http://localhost:5173`**.
2. Haz clic en **"Nuevo Proyecto"** o selecciona uno existente.
3. En la sección **Fuentes e Insumos**, arrastra tu audio, PDF o escribe el problema de software.
4. Presiona **"Analizar Insumos con IA"**.
5. Aprueba los requerimientos y revisa los cuatro **Diagramas PlantUML**. Los mockups se habilitan únicamente después de aprobar los diagramas.
6. En **Mockups**, usa el explorador por flujo, módulo y plataforma para marcar solo las pantallas que deseas generar. Los trabajos continúan en el servidor aunque cambies de pestaña.
7. Revisa los indicadores de calidad y cobertura Web/Tablet/Móvil. Una pantalla con HTML truncado, sin estilos, con imágenes rotas o rutas locales se marca como inválida y no puede aprobarse.
8. Configura una paleta manual o solicita una sugerencia puntual a la IA. La paleta queda versionada y se incorpora al contrato visual de las regeneraciones posteriores.
9. Aprueba los mockups válidos y abre **"Previsualizar documento en PDF"** para ver y descargar el informe formal entregable.

La generación utiliza un manifiesto de navegación estructurado (`pantalla`, `flujo`, `módulo`, `rol`, `plataforma`, `shell` y `ruta`). Esto permite preservar recorridos móviles de cliente y tablet de mesero, y mantener un contrato visual común entre pantallas relacionadas.
