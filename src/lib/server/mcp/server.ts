// #502 — Waypoint's MCP server (v3.1: read-only tools). One instance per request
// (stateless Streamable HTTP), bound to the connected user's context.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { env } from '$env/dynamic/private';
import type { McpContext } from './context';
import { CARD_HTML } from './card-html';
import { scrub, UI_MIME, UI_URI, uiMeta } from './present';
import { TOOLS, WRITE_TOOLS } from './tools';
import { writesEnabled } from './writes/gate';

export const INSTRUCTIONS =
	"Waypoint is the user's group-trip planner, and you are helping one of its members. " +
	"Ground every answer in Waypoint data, in the trip's local time, and say when something isn't recorded rather than guessing. " +
	"Advice is welcome when it serves what the user asked (better timing, what fits together, what's missing), " +
	'offered as a suggestion for them to decide: the trip belongs to its members. ' +
	"If a trip's AI access is off, say so plainly.";

// #503 / ADR-0025 §3 — appended while writes are on.
export const WRITE_INSTRUCTIONS =
	"To change something, call propose_changes with the user's own words as `quote`, show the preview, and wait: " +
	'call commit_changes only after the user says yes in a later message (or taps Confirm). ' +
	'Record only what the user stated; never infer a booking, payment, vote or choice. ' +
	'Talk to Waypoint in ISO dates and 24-hour times; show times to the user as 9:40 am. "Undo that" → revert_change.';

export function buildServer(ctx: McpContext): McpServer {
	const writes = writesEnabled(env);
	const server = new McpServer(
		{ name: 'waypoint', version: '3.2.0' },
		{ instructions: writes ? `${INSTRUCTIONS} ${WRITE_INSTRUCTIONS}` : INSTRUCTIONS }
	);

	server.registerResource(
		'waypoint-cards',
		UI_URI,
		{ mimeType: UI_MIME, description: 'Waypoint card view' },
		async () => ({
			contents: [{ uri: UI_URI, mimeType: UI_MIME, text: CARD_HTML }]
		})
	);

	for (const tool of writes ? [...TOOLS, ...WRITE_TOOLS] : TOOLS) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
				annotations: { readOnlyHint: !tool.mutates },
				_meta: uiMeta
			},
			async (args: unknown) => {
				try {
					return await tool.run(ctx, args);
				} catch (err) {
					return {
						content: [
							{
								type: 'text' as const,
								text: scrub((err as Error).message || 'Something went wrong.')
							}
						],
						isError: true
					};
				}
			}
		);
	}
	return server;
}
