# Mistral Codestral CLI (Beta 0.1)

CLI ligero e interactivo para desarrolladores potenciado por **Codestral** (`codestral-latest`), el modelo de Mistral AI especializado en generación y análisis de código.

Esta versión **Beta 0.1** implementa un agente autónomo con **Function Calling** nativo que puede inspeccionar y leer archivos locales de tu proyecto de forma segura.

---

## ✨ Características de la Beta 0.1

- 🧠 **Potenciado por Codestral**: Utiliza por defecto `codestral-latest` con soporte nativo de llamadas a funciones.
- 🔑 **Autenticación Dual Automática**:
  - `MISTRAL_API_KEY`: Se conecta automáticamente a `https://api.mistral.ai`.
  - `CODESTRAL_API_KEY`: Se conecta automáticamente a `https://codestral.mistral.ai`.
- 🔍 **Herramienta `read_file` Integrada**: Codestral decide autónomamente cuándo leer archivos del workspace para responder preguntas sobre código, dependencias o arquitectura.
- 🛡️ **Seguridad contra Path Traversal**: Protege el sistema restringiendo las lecturas al directorio de trabajo actual y limitando el tamaño máximo de archivo para cuidar el contexto.
- 💬 **Modo One-Shot y REPL**: Úsalo para consultas rápidas de un comando o entra en una sesión interactiva continua con memoria contextual.

---

## 🚀 Requisitos

- **Node.js**: v18.0.0 o superior (compatible con ES Modules nativos).
- **NPM**: v9.0.0 o superior.
- Una API Key de Mistral AI ([console.mistral.ai](https://console.mistral.ai/)) o Codestral ([codestral.mistral.ai](https://codestral.mistral.ai/)).

---

## 📦 Instalación y Compilación

1. Clona el repositorio e instala las dependencias:
   ```bash
   git clone <repo-url>
   cd mistral-cli
   npm install
   ```

2. Compila el código TypeScript a JavaScript ESM:
   ```bash
   npm run build
   ```

3. (Opcional) Enlaza el comando globalmente en tu terminal:
   ```bash
   npm link
   # Ahora puedes ejecutarlo desde cualquier proyecto usando:
   mistral-cli --help
   ```

---

## ⚙️ Configuración de Credenciales

Crea un archivo `.env` en la raíz del proyecto (o en la carpeta desde donde ejecutes el CLI) basándote en `.env.example`:

```bash
cp .env.example .env
```

Edita `.env` con tu clave:

```env
# Opción A: Clave estándar de La Plateforme (Mistral Studio)
MISTRAL_API_KEY=tu_api_key_de_mistral

# Opción B: Clave dedicada de Codestral
# CODESTRAL_API_KEY=tu_api_key_de_codestral
```

También puedes exportarla directamente en tu terminal:
```bash
export MISTRAL_API_KEY="tu_api_key"
```

---

## 💡 Ejemplos de Uso

### 1. Modo One-Shot (Consulta directa)

Pide a Codestral que examine un archivo y te explique su funcionamiento o dependencias:

```bash
mistral-cli "¿Qué dependencias y scripts están configurados en package.json?"
```

```bash
mistral-cli "¿Qué hace la función resolveConfig en src/config.ts?"
```

Especificando un modelo o base URL diferente:
```bash
mistral-cli -m codestral-2501 "Explica el diseño de tipos en src/tools/types.ts"
```

### 2. Modo Interactivo (REPL)

Inicia una sesión interactiva ejecutando el comando sin argumentos:

```bash
mistral-cli
```

En el prompt interactivo puedes conversar continuamente con Codestral mientras mantiene el contexto de los archivos analizados:

```text
============================================================
Mistral Codestral CLI (v0.1.0-beta.1)
Modelo activo: codestral-latest
Endpoint:      https://api.mistral.ai
Espacio de trabajo: /home/ender/mistral-cli
Escribe tu consulta o usa /help, /clear o /exit.
============================================================

codestral> Lee el archivo src/tools/read-file.ts y dime qué validaciones de seguridad tiene.
[Herramienta] Ejecutando 'read_file' con parámetros: { path: 'src/tools/read-file.ts' }
[Herramienta] 'read_file' completada.

El archivo 'src/tools/read-file.ts' implementa las siguientes validaciones:
1. Protección contra Path Traversal...
2. Comprobación de existencia y tipo de archivo...
3. Límite de tamaño máximo (100 KB)...

codestral> /history
Total de mensajes en memoria: 5

codestral> /clear
Historial de conversación reiniciado.

codestral> /exit
¡Hasta luego!
```

---

## 🛠️ Comandos en Modo REPL

| Comando | Descripción |
|---|---|
| `/help` | Muestra la ayuda de comandos del REPL |
| `/clear` | Reinicia la memoria de conversación (mantiene el prompt de sistema) |
| `/history` | Muestra la cantidad de mensajes acumulados en el historial |
| `/exit` o `/quit` | Termina la sesión interactiva |

---

## 🧪 Pruebas Unitarias

El proyecto cuenta con una suite completa de pruebas unitarias usando `vitest`:

```bash
# Ejecutar todas las pruebas
npm test

# Ejecutar una suite específica
npm test -- tests/read-file.test.ts
```

---

## 📁 Estructura del Proyecto

```text
mistral-cli/
├── src/
│   ├── index.ts           # Binario ejecutable con shebang #!/usr/bin/env node
│   ├── cli.ts             # Parser de argumentos CLI, modo One-Shot y REPL
│   ├── agent.ts           # CodestralAgent y bucle de Function Calling
│   ├── config.ts          # Resolución dual de credenciales y endpoints
│   └── tools/
│       ├── types.ts       # Interfaces para herramientas y esquemas Mistral
│       ├── read-file.ts   # Implementación segura de la tool read_file
│       └── index.ts       # Registro central de herramientas disponibles
├── tests/
│   ├── config.test.ts     # Pruebas de resolución de configuración
│   ├── read-file.test.ts  # Pruebas de lectura segura y path traversal
│   ├── agent.test.ts      # Pruebas de bucle de herramientas y mocks
│   └── cli.test.ts        # Pruebas de argumentos de línea de comandos
├── tasks/
│   ├── plan.md            # Plan de implementación
│   └── todo.md            # Registro de tareas y checkpoints
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🗺️ Próximas Características (Roadmap Beta 0.2+)

- [ ] Herramienta `list_files` para explorar el árbol de directorios del proyecto.
- [ ] Herramienta `write_file` / `edit_file` con confirmación interactiva para aplicar cambios en código.
- [ ] Streaming de respuestas token a token (`chat.stream`).
- [ ] Soporte para comandos con prefijo `@` para adjuntar contexto manual.

---

## 📄 Licencia

MIT
