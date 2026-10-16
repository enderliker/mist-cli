#!/usr/bin/env node

import { main } from "./cli.js";

main()
  .then((exitCode) => {
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  })
  .catch((err) => {
    console.error("Error fatal:", err);
    process.exit(1);
  });
