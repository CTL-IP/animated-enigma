/**
 * Entry point for Claude Code (see `.mcp.json`): the Texas tax server over
 * stdio. stdout is the protocol channel — one stray line on it corrupts the
 * stream and looks like a crash — so this file and everything it loads write
 * diagnostics to stderr only.
 *
 * No top-level await: tsx runs this as CommonJS (the package has no
 * "type": "module"), where it isn't allowed.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createTexasTaxServer } from './server';

async function main() {
  await createTexasTaxServer().connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`texas-tax MCP server failed to start: ${message}\n`);
  process.exit(1);
});
