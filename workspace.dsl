workspace "I-CASE - Plataforma Inteligente de Ingeniería de Software" "Arquitectura del sistema I-CASE con enrutador multi-modelo de IA (Groq, Gemini, DeepSeek, OpenRouter), generación de diagramas C4 y exportación IEEE 830" {

    model {
        # --- ACTORES ---
        user = person "Ingeniero / Analista de Software" "Usuario que carga insumos (texto, audio o PDF) para obtener la especificación del sistema y sus diagramas de arquitectura." "User"

        # --- SISTEMAS DE IA EXTERNOS (MULTI-PROVEEDOR) ---
        group "Proveedores Externos de IA (Multi-LLM Gateway)" {
            geminiApi = softwareSystem "Google Gemini API" "Servicio multimodal para procesamiento de audios, textos extensos y visión." "External AI"
            groqApi = softwareSystem "Groq Cloud API" "Inferencia ultra-rápida (<2s) con modelos de código abierto (Llama 3.3 70B)." "External AI"
            deepseekApi = softwareSystem "DeepSeek API" "Inferencia especializada en razonamiento técnico y arquitectura de software." "External AI"
            openrouterApi = softwareSystem "OpenRouter Fast API" "Gateway unificado de alta velocidad para fallback y enrutamiento alternativo." "External AI"
        }

        # --- SISTEMA PRINCIPAL I-CASE ---
        icase = softwareSystem "Plataforma I-CASE" "Sistema inteligente para la ingesta de insumos, especificación IEEE 830, síntesis PlantUML y exportación en PDF." {

            # -------------------------------------------------------------
            # CONTENEDOR 1: FRONTEND Y SUS COMPONENTES
            # -------------------------------------------------------------
            frontend = container "Single-Page Application" "Interfaz web reactiva e interactiva para gestionar proyectos, previsualizar diagramas PlantUML y descargar informes." "React + Vite + TailwindCSS" "Web Frontend" {
                group "Frontend - Componentes React UI" {
                    projectWorkspace = component "Project Workspace UI" "Panel central que organiza las pestañas de insumos, requerimientos y diagramas." "React Component" "Frontend Component"
                    sourcesPanel = component "Sources & Insumos Panel" "Componente de carga y gestión de archivos (audios, PDFs, textos de requerimientos)." "React Component" "Frontend Component"
                    diagramsTab = component "PlantUML Viewer & Editor" "Visualizador interactivo de los diagramas PlantUML (Casos de Uso, C4, Clases, WBS)." "React Component" "Frontend Component"
                    pdfGenerator = component "Client-side PDF Exporter" "Motor de generación del informe técnico en PDF listo para entrega formal." "jsPDF Component" "Frontend Component"
                    apiService = component "API Service Client" "Módulo de peticiones HTTP (Axios) hacia la API REST del backend." "JavaScript Utility" "Frontend Component"
                }
            }
            
            # -------------------------------------------------------------
            # CONTENEDOR 2: BACKEND Y SUS COMPONENTES
            # -------------------------------------------------------------
            backend = container "API Application Backend" "Servidor de Clean Architecture que maneja la lógica de negocio, procesamiento de insumos y comunicación con las APIs de IA." "Node.js + Express" "Web Backend" {
                group "Backend - HTTP & Adapter Layer" {
                    routes = component "Express HTTP Routers" "Define endpoints REST (/api/proyectos, /api/insumos, /api/analisis)." "Express Routes" "Backend Component"
                    controllers = component "Controllers Layer" "Adapta peticiones HTTP y las canaliza a los Casos de Uso (ProyectoController, InsumoController)." "Express Controllers" "Backend Component"
                }

                group "Backend - Domain & Use Cases" {
                    procesarIaUseCase = component "Caso de Uso: ProcesarConIA" "Orquesta el flujo principal de análisis: lectura de insumos, llamado al motor de IA y almacenamiento." "Use Case" "Backend Component"
                    extraerInsumoUseCase = component "Caso de Uso: ExtraerTextoInsumo" "Procesa y normaliza audios y archivos PDF subidos." "Use Case" "Backend Component"
                    exportarPdfUseCase = component "Caso de Uso: ExportarDocumentoPDF" "Genera la estructura formal para exportación a PDF." "Use Case" "Backend Component"
                }

                group "Backend - Infrastructure & AI Gateway" {
                    modelosIaService = component "ModelosIaService (AI Gateway & Router)" "Enrutador inteligente con soporte para Auto, Groq, Gemini, DeepSeek y OpenRouter. Ejecuta fallbacks automáticos." "Infrastructure Service" "AI Engine"
                    plantumlSynthesizer = component "PlantUMLSynthesizer" "Limpia, valida y sintetiza el código PlantUML generado por la IA (Casos de uso, C4, Clases, WBS)." "Synthesizer Service" "AI Engine"
                    promptEngine = component "Prompt Templates Engine" "Combina plantillas (analista IEEE 830, diseñador arquitectura, auditor QA) con el insumo del usuario." "Template Engine" "AI Engine"
                    pdfExtractorService = component "PDF & Audio Extractor" "Extrae texto de PDFs mediante pdf-parse y prepara archivos multimedia." "Parser Service" "Backend Component"
                    mongooseRepositories = component "Mongoose Data Repositories" "Modelos y repositorios de datos para Mongo (Proyecto, Insumo, DocumentoTecnico)." "Mongoose ODM" "Backend Component"
                }
            }
            
            # -------------------------------------------------------------
            # CONTENEDORES PERSISTENCIA Y ARCHIVOS
            # -------------------------------------------------------------
            database = container "Base de Datos Principal" "Persiste proyectos, insumos subidos, historial de versiones y configuraciones de diagramas." "MongoDB" "Database"
            fileStorage = container "Almacenamiento de Archivos" "Almacena audios subidos (mp3, wav, m4a) y documentos PDF en disco local." "Local Disk / Multer" "File System"
        }

        # --- RELACIONES DE NIVEL 1 Y 2 ---
        user -> frontend "Usa la aplicación web a través del navegador" "HTTP / Port 5173"
        frontend -> backend "Consulta y envía información mediante REST API" "JSON over HTTP / Port 5000"
        backend -> database "Persiste proyectos e insumos" "MongoDB Protocol / Port 27017"
        backend -> fileStorage "Guarda/lee audios y PDFs subidos" "File I/O"

        # --- RELACIONES MULTI-PROVEEDOR IA ---
        modelosIaService -> groqApi "Ejecuta inferencia ultra-rápida (Llama 3.3 70B)" "HTTPS / REST API"
        modelosIaService -> geminiApi "Ejecuta análisis de gran contexto / multimodal" "HTTPS / REST API"
        modelosIaService -> deepseekApi "Ejecuta razonamiento especializado de arquitectura" "HTTPS / REST API"
        modelosIaService -> openrouterApi "Fallback y redundancia de modelos" "HTTPS / REST API"

        # --- RELACIONES INTERNAS DEL BACKEND ---
        routes -> controllers "Canaliza peticiones REST"
        controllers -> procesarIaUseCase "Invoca análisis inteligente"
        controllers -> extraerInsumoUseCase "Solicita procesamiento de archivos"
        controllers -> exportarPdfUseCase "Solicita reporte técnico"
        
        procesarIaUseCase -> modelosIaService "Solicita generación de texto y diagramas"
        procesarIaUseCase -> mongooseRepositories "Guarda el análisis resultante"
        extraerInsumoUseCase -> pdfExtractorService "Parsea PDFs/audios"

        modelosIaService -> promptEngine "Ensambla el prompt con directivas IEEE830 + PlantUML"
        modelosIaService -> plantumlSynthesizer "Limpia y valida los bloques plantuml recibidos de las IAs"

        mongooseRepositories -> database "Operaciones CRUD Mongoose"

        # --- RELACIONES INTERNAS DEL FRONTEND ---
        user -> projectWorkspace "Navega el espacio de trabajo"
        projectWorkspace -> sourcesPanel "Carga e ingesta de insumos"
        projectWorkspace -> diagramsTab "Interacción con diagramas PlantUML"
        projectWorkspace -> pdfGenerator "Descarga el reporte técnico"
        
        sourcesPanel -> apiService "Envía archivos y prompts al backend"
        diagramsTab -> apiService "Solicita regeneración de diagramas"
        apiService -> routes "HTTP Client -> REST Endpoint"
    }

    views {
        # Vista 1: Contexto del Sistema (Nivel 1)
        systemContext icase "SystemContext" "Diagrama de Contexto del Sistema I-CASE" {
            include *
            autoLayout lr
        }

        # Vista 2: Contenedores (Nivel 2)
        container icase "Containers" "Diagrama de Contenedores de I-CASE y Proveedores de IA" {
            include *
            autoLayout tb
        }

        # Vista 3: Componentes Backend & AI Router (Nivel 3)
        component backend "BackendComponents" "Diagrama de Componentes Internos del Backend, Clean Architecture y AI Gateway" {
            include *
            autoLayout tb
        }

        # Vista 4: Componentes Frontend (Nivel 3)
        component frontend "FrontendComponents" "Diagrama de Componentes del Frontend (React)" {
            include *
            autoLayout tb
        }

        # --- ESTILOS VISUALES C4 ---
        styles {
            element "Person" {
                shape Person
                background #0f4c81
                color #ffffff
            }
            element "Software System" {
                background #1b6ec2
                color #ffffff
            }
            element "External AI" {
                shape Hexagon
                background #6f42c1
                color #ffffff
            }
            element "Web Frontend" {
                shape WebBrowser
                background #007acc
                color #ffffff
            }
            element "Web Backend" {
                shape Hexagon
                background #28a745
                color #ffffff
            }
            element "Database" {
                shape Cylinder
                background #dc3545
                color #ffffff
            }
            element "File System" {
                shape Folder
                background #fd7e14
                color #ffffff
            }
            element "Backend Component" {
                background #17a2b8
                color #ffffff
            }
            element "AI Engine" {
                shape Component
                background #e83e8c
                color #ffffff
            }
            element "Frontend Component" {
                background #20c997
                color #ffffff
            }
        }
    }
}
