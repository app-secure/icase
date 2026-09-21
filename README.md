# 🛠️ I-CASE: Plataforma Inteligente de Ingeniería de Software

I-CASE es una herramienta asistida por Inteligencia Artificial (Google Gemini) diseñada para convertir ideas, audios de reuniones, documentos PDF o notas de texto en un **documento técnico formal de software y arquitectura completa** en pocos segundos.

---

## 💡 ¿Cómo funciona la aplicación? 

El flujo de trabajo es muy intuitivo y consta de 4 pasos:

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

4. **Documento Formal y Exportación a PDF:**
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

#### 📦 Librerías principales del Backend:
Al ejecutar `npm install` se descargan las siguientes librerías:
* **`express`**: Servidor web y creación de las rutas API REST.
* **`mongoose`**: Conexión y gestión de la base de datos MongoDB.
* **`axios`**: Para comunicarse directamente con la API de Google Gemini.
* **`multer`**: Para recibir y guardar los archivos subidos (audios, PDFs, textos).
* **`pdf-parse`**: Para extraer el texto de documentos PDF.
* **`cors`**: Permite la comunicación segura entre el frontend y el backend.
* **`dotenv`**: Para cargar variables de entorno (claves de API, puertos).

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
5. Navega por las pestañas para revisar los **Requerimientos**, los **Diagramas PlantUML** interactivos o haz clic en **"Previsualizar documento en PDF"** para ver y descargar el informe formal entregable.
