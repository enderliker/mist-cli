/**
 * Definición genérica para una función compatible con Mistral Function Calling.
 */
export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface MistralTool {
  type: "function";
  function: FunctionDefinition;
}

export type ConfirmCallback = (description: string) => Promise<boolean> | boolean;

export interface ToolExecutor<TArgs = Record<string, unknown>> {
  definition: MistralTool;
  execute: (
    args: TArgs,
    workspaceDir?: string,
    onConfirm?: ConfirmCallback
  ) => Promise<string> | string;
}
