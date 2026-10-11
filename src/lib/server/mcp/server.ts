// #502 — Waypoint's MCP server (v3.1: read-only tools). One instance per request
// (stateless Streamable HTTP), bound to the connected user's context.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context';
import { CARD_HTML } from './card-html';
import { UI_MIME, UI_URI, uiMeta } from './present';
import { TOOLS } from './tools';

export const INSTRUCTIONS =
	"Waypoint is the user's group-trip planner, and you are helping one of its members. " +
	"Ground every answer in Waypoint data, in the trip's local time, and say when something isn't recorded rather than guessing. " +
	"Advice is welcome when it serves what the user asked (better timing, what fits together, what's missing), " +
	'offered as a suggestion for them to decide: the trip belongs to its members. ' +
	"If a trip's AI access is off, say so plainly.";

export function buildServer(ctx: McpContext): McpServer {
	const server = new McpServer({ name: 'waypoint', version: '3.1.0' }, { instructions: INSTRUCTIONS });

	server.registerResource('waypoint-cards', UI_URI, { mimeType: UI_MIME, description: 'Waypoint card view' }, async () => ({
		contents: [{ uri: UI_URI, mimeType: UI_MIME, text: CARD_HTML }]
	}));

	for (const tool of TOOLS) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
				annotations: { readOnlyHint: true },
				_meta: uiMeta
			},
			async (args: unknown) => {
				try {
					return await tool.run(ctx, args);
				} catch (err) {
					return { content: [{ type: 'text' as const, text: (err as Error).message || 'Something went wrong.' }], isError: true };
				}
			}
		);
	}
	return server;
}
