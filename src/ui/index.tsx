import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { CodestralAgent } from "../agent.js";

export interface TuiOptions {
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  stderr?: NodeJS.WriteStream;
}

export async function startTui(
  agent: CodestralAgent,
  version: string,
  options?: TuiOptions
): Promise<void> {
  const instance = render(<App agent={agent} version={version} />, {
    exitOnCtrlC: true,
    stdout: options?.stdout ?? process.stdout,
    stdin: options?.stdin ?? process.stdin,
    stderr: options?.stderr ?? process.stderr,
  });

  await instance.waitUntilExit();
}
