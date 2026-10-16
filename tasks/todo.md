# Task List: Mistral Codestral CLI (Beta 0.1)

## Phase 1: Foundation & Local Tools

## Task 1: Inicialización del proyecto TypeScript ESM y configuración de autenticación dual

**Description:** Inicializar el proyecto Node.js en modo ES Module (`"type": "module"`), instalar el SDK oficial `@mistralai/mistralai`, `dotenv`, TypeScript y `vitest`, y crear el módulo `src/config.ts` que resuelve las credenciales y el endpoint correcto (`https://api.mistral.ai` para `MISTRAL_API_KEY` o `https://codestral.mistral.ai` para `CODESTRAL_API_KEY`, usando `codestral-latest` por defecto).

**Acceptance criteria:**
- [x] `package.json` y `tsconfig.json` están configurados con soporte ESM (`NodeNext`), scripts `build`, `dev`, `start` y `test`.
- [x] `resolveConfig()` detecta `MISTRAL_API_KEY` (endpoint `https://api.mistral.ai`) y `CODESTRAL_API_KEY` (endpoint `https://codestral.mistral.ai`), permitiendo overrides mediante `MISTRAL_BASE_URL` y `MISTRAL_MODEL` (default `codestral-latest`).
- [x] Si ninguna API key está configurada, `resolveConfig()` lanza un error claro indicando cómo configurar `MISTRAL_API_KEY` o `CODESTRAL_API_KEY`.

**Verification:**
- [x] Tests pass: `npm test -- tests/config.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: Ejecutar tests con distintas combinaciones de variables de entorno.

**Dependencies:** None

**Files likely touched:**
- `package.json`
- `tsconfig.json`
- `src/config.ts`
- `tests/config.test.ts`

**Estimated scope:** Medium: 4 files

---

## Task 2: Sistema de herramientas (Tool Registry) e implementación segura de `read_file`

**Description:** Crear el registro de herramientas (`src/tools/index.ts`) y la herramienta `read_file` (`src/tools/read-file.ts`) compatible con el formato JSON Schema de Function Calling de Mistral AI. La herramienta leerá archivos de texto dentro del directorio de trabajo (`process.cwd()`), soportará lectura completa o por rango de líneas opcional (`start_line`, `end_line`), prevendrá path traversal fuera del workspace y manejará errores de archivo inexistente o tamaño excesivo devolviendo un resultado estructurado al modelo.

**Acceptance criteria:**
- [x] `readFileTool` define el JSON Schema para Mistral (`name: "read_file"`, parámetros `path` requerido, `start_line` y `end_line` opcionales).
- [x] `executeReadFile()` lee archivos válidos dentro del workspace y rechaza rutas fuera del directorio de trabajo (`../`) o directorios.
- [x] Cuando un archivo no existe o excede el límite de tamaño (ej. 100 KB), devuelve un mensaje de error claro en texto/JSON sin lanzar una excepción no controlada que rompa la sesión.

**Verification:**
- [x] Tests pass: `npm test -- tests/read-file.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: Verificar en tests la lectura de un archivo real, un rango de líneas y el bloqueo de `../../etc/passwd`.

**Dependencies:** Task 1

**Files likely touched:**
- `src/tools/types.ts`
- `src/tools/read-file.ts`
- `src/tools/index.ts`
- `tests/read-file.test.ts`

**Estimated scope:** Medium: 4 files

---

## Checkpoint: After Tasks 1-2 (Foundation)
- [x] All tests pass (`npm test`)
- [x] Application builds without errors (`npm run build`)
- [x] Configuración dual de API y herramienta `read_file` verificadas aisladamente
- [x] Review with human before proceeding if adjustments are needed

---

## Phase 2: Core Agent & CLI Interface

## Task 3: Agente Codestral con bucle de Function Calling

**Description:** Implementar la clase/módulo `CodestralAgent` (`src/agent.ts`) que administra el historial de conversación con un prompt de sistema enfocado en desarrollo de código y ejecuta el bucle de Function Calling contra `client.chat.complete()`. Cuando `codestral-latest` responde con `toolCalls`, el agente ejecuta las herramientas locales solicitadas (como `read_file`), registra un callback opcional en consola para informar al usuario (`[Tool] Leyendo archivo...`), añade el mensaje `role: "tool"` con `toolCallId` y obtiene la respuesta final del asistente.

**Acceptance criteria:**
- [x] `CodestralAgent` mantiene el historial de mensajes (`system`, `user`, `assistant`, `tool`) entre turnos de una sesión.
- [x] Cuando el modelo devuelve `toolCalls`, el agente parsea los argumentos JSON, ejecuta `executeTool()`, agrega el mensaje `role: "tool"` con el `toolCallId` correspondiente y vuelve a invocar `chat.complete()`.
- [x] El bucle de herramientas corta de forma segura tras alcanzar `MAX_TOOL_ITERATIONS` (ej. 5) para evitar loops infinitos.

**Verification:**
- [x] Tests pass: `npm test -- tests/agent.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: Verificar mediante test con mock del cliente Mistral una conversación completa `user -> assistant (tool_call: read_file) -> tool -> assistant (respuesta final)`.

**Dependencies:** Task 1, Task 2

**Files likely touched:**
- `src/agent.ts`
- `tests/agent.test.ts`

**Estimated scope:** Small: 2 files

---

## Task 4: Interfaz CLI con modo One-Shot y REPL interactivo en terminal

**Description:** Construir la interfaz de línea de comandos (`src/cli.ts` y `src/index.ts`) que permita tanto consultas directas de un solo comando (`mistral-cli "Lee package.json y dime qué dependencias tiene"`) como un modo interactivo REPL (`mistral-cli` sin argumentos) usando `node:readline/promises`. Mostrar indicadores claros en la terminal cuando Codestral invoca `read_file` y soportar comandos básicos de sesión (`/help`, `/clear`, `/exit`).

**Acceptance criteria:**
- [x] Ejecutar con un prompt como argumento (`mistral-cli "<prompt>"`) ejecuta el agente en modo one-shot, imprime las llamadas a herramientas y la respuesta final, y termina con código `0`.
- [x] Ejecutar sin argumentos inicia el modo REPL interactivo con soporte para `/help`, `/clear` (reiniciar historial) y `/exit`.
- [x] Soporta flags básicos como `--help`, `--version` (`0.1.0-beta.1`) y `--model`.

**Verification:**
- [x] Tests pass: `npm test -- tests/cli.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: Ejecutar `node dist/index.js --help` y `node dist/index.js --version`.

**Dependencies:** Task 3

**Files likely touched:**
- `src/cli.ts`
- `src/index.ts`
- `tests/cli.test.ts`

**Estimated scope:** Medium: 3 files

---

## Checkpoint: After Tasks 3-4 (Core Features)
- [x] All tests pass (`npm test`)
- [x] Application builds without errors (`npm run build`)
- [x] Core user flow works end-to-end (One-shot y REPL interactivo con `read_file`)

---

## Phase 3: Polish & Release Beta 0.1

## Task 5: Empaquetado ejecutable (`bin`), ejemplo `.env.example` y documentación `README.md`

**Description:** Configurar el campo `bin` en `package.json` con shebang `#!/usr/bin/env node` en `src/index.ts` para que el CLI pueda invocarse directamente como comando `mistral-cli` (o vía `npm link` / `npx`), añadir `.env.example` y `.gitignore`, y documentar la instalación, configuración de keys (`MISTRAL_API_KEY` y `CODESTRAL_API_KEY`) y ejemplos de uso de la Beta 0.1 en `README.md`.

**Acceptance criteria:**
- [x] `dist/index.js` incluye el shebang `#!/usr/bin/env node` y `package.json` declara el binario `mistral-cli`.
- [x] `.env.example` y `README.md` documentan claramente el uso con `MISTRAL_API_KEY` y `CODESTRAL_API_KEY`, el modo one-shot, el modo REPL y el alcance de la Beta 0.1 (`read_file`).
- [x] Todos los tests unitarios y de integración pasan sin errores.

**Verification:**
- [x] Tests pass: `npm test`
- [x] Build succeeds: `npm run build`
- [x] Manual check: Ejecutar `node dist/index.js --version` y verificar salida `0.1.0-beta.1`.

**Dependencies:** Task 4

**Files likely touched:**
- `package.json`
- `.env.example`
- `.gitignore`
- `README.md`

**Estimated scope:** Medium: 4 files

---

## Checkpoint: Complete
- [x] All tests pass (`npm test`)
- [x] Build clean (`npm run build`)
- [x] All acceptance criteria met
- [x] Ready for review
