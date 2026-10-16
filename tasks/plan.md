# Implementation Plan: Mistral Codestral CLI (Beta 0.1)

## Overview
Construiremos la versión **Beta 0.1** de `mistral-cli`, una herramienta de línea de comandos en **TypeScript / Node.js (ESM)** impulsada por el modelo **`codestral-latest`** de Mistral AI. El CLI funcionará como un agente ligero capaz de ejecutarse tanto en modo **one-shot** (`mistral-cli "Explica el archivo package.json"`) como en modo **chat interactivo (REPL)**, utilizando **Function Calling** nativo del SDK `@mistralai/mistralai` para invocar de forma autónoma la herramienta local `read_file` cuando necesite inspeccionar archivos del proyecto.

## Architecture Decisions
- **Runtime y Módulo ESM (`"type": "module"`)**: El SDK oficial `@mistralai/mistralai` (v1/v2) se distribuye exclusivamente como ES Module. Configuraremos TypeScript con `NodeNext` y `vitest` para pruebas unitarias rápidas.
- **Soporte Dual de Endpoints (`api.mistral.ai` y `codestral.mistral.ai`)**: Codestral puede consumirse tanto con una API key estándar de Mistral Studio (`MISTRAL_API_KEY` en `https://api.mistral.ai`) como con una API key dedicada de Codestral (`CODESTRAL_API_KEY` en `https://codestral.mistral.ai`). El módulo de configuración detectará automáticamente qué variable está definida (permitiendo también override con `MISTRAL_BASE_URL` y `MISTRAL_MODEL`, por defecto `codestral-latest`).
- **Arquitectura de Herramientas Extensible (Tool Registry)**: Aunque la Beta 0.1 solo expone `read_file`, diseñaremos una interfaz limpia (`ToolDefinition` + `executeTool`) que separa el JSON Schema enviado a Codestral de su implementación local, facilitando añadir `list_files` o `write_file` en la Beta 0.2 sin tocar el bucle del agente.
- **Seguridad y Límites en `read_file`**: La herramienta `read_file` resolverá rutas relativas al directorio de trabajo (`process.cwd()`), bloqueará intentos de lectura fuera del workspace (path traversal `..`), validará que el objetivo sea un archivo de texto legible y truncará o paginará archivos excesivamente grandes para no desbordar la ventana de contexto.
- **Bucle de Agente (Function Calling Loop)**: El agente enviará el historial de mensajes (`system`, `user`, `assistant`, `tool`) junto con la especificación de herramientas a `client.chat.complete()`. Si `finishReason === "tool_calls"` (o `message.toolCalls` contiene llamadas), ejecutará cada herramienta localmente, añadirá el mensaje `role: "tool"` con su `toolCallId` obligatorio y volverá a consultar al modelo (con un límite máximo de iteraciones para evitar bucles infinitos).

## Dependency Graph

```
Configuración & Auth Dual (src/config.ts)
    │
    ├── Registro de Herramientas + read_file (src/tools/read-file.ts, src/tools/index.ts)
    │       │
    │       └── Agente Codestral & Function Calling Loop (src/agent.ts)
    │               │
    │               └── Interfaz CLI: One-Shot & REPL Interactivo (src/cli.ts, src/index.ts)
    │                       │
    │                       └── Binario Ejecutable & Documentación (package.json bin, README.md)
```

## Task List

### Phase 1: Foundation & Local Tools
- [x] Task 1: Inicialización del proyecto TypeScript ESM y configuración de autenticación dual
- [x] Task 2: Sistema de herramientas (Tool Registry) e implementación segura de `read_file`

### Checkpoint: Foundation
- [x] Tests pass (`npm test`), builds clean (`npm run build`)
- [x] Resolución de credenciales y lectura segura de archivos verificadas con tests unitarios

### Phase 2: Core Agent & CLI Interface
- [x] Task 3: Agente Codestral con bucle de Function Calling (`chat.complete` + ejecución de tools)
- [x] Task 4: Interfaz CLI con modo One-Shot y REPL interactivo en terminal

### Checkpoint: Core Features
- [x] End-to-end flow works (el usuario pide leer/explicar un archivo y el agente invoca `read_file` y responde)

### Phase 3: Polish & Release Beta 0.1
- [x] Task 5: Configuración de binario ejecutable (`bin`), manejo de errores de usuario y documentación `README.md`

### Checkpoint: Complete
- [x] All acceptance criteria met
- [x] Ready for review

## Parallelization Opportunities
- **Task 1** debe completarse primero porque inicializa `package.json`, `tsconfig.json` y el runner de tests (`vitest`).
- Una vez completada **Task 1**, **Task 2** (`read_file` tool) puede desarrollarse de forma independiente antes de conectarla en **Task 3**.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Confusión entre `MISTRAL_API_KEY` y `CODESTRAL_API_KEY` (401 Unauthorized si se usa la key de Codestral contra `api.mistral.ai`) | High | Detectar automáticamente `CODESTRAL_API_KEY` y asignar `serverURL: "https://codestral.mistral.ai"`, o usar `https://api.mistral.ai` cuando se provea `MISTRAL_API_KEY`. |
| Bucles infinitos de llamadas a herramientas por parte del modelo | Med | Establecer un límite estricto de turnos de herramientas (`MAX_TOOL_ITERATIONS = 5`) por consulta del usuario. |
| Lectura de archivos binarios o demasiado grandes que saturen el contexto o fallen | Med | Limitar tamaño máximo de lectura (ej. 100 KB / 500 líneas por defecto con soporte de rango de líneas opcional) y devolver errores descriptivos en JSON al modelo para que pueda informarlo sin abortar el proceso. |
| Path traversal (el modelo intenta leer `/etc/passwd` o fuera del proyecto) | High | Validar con `path.resolve` y `path.relative` que la ruta solicitada esté dentro del directorio de trabajo actual (`cwd`). |

## Open Questions
- ¿Deseas que `read_file` permita únicamente leer archivos dentro del directorio actual de trabajo (`process.cwd()`), o prefieres permitir rutas absolutas en cualquier parte del sistema del usuario? (Por defecto en el plan restringimos al workspace actual por seguridad).
