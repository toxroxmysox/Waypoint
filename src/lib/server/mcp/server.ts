// #502 — Waypoint's MCP server (v3.1: read-only tools). One instance per request
// (stateless Streamable HTTP), bound to the connected user's context.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from './context';

export const INSTRUCTIONS =
	"Waypoint is the user's group-trip planner, and you are helping one of its members. " +
	"Ground every answer in Waypoint data, in the trip's local time, and say when something isn't recorded rather than guessing. " +
	"Advice is welcome when it serves what the user asked (better timing, what fits together, what's missing), " +
	'offered as a suggestion for them to decide: the trip belongs to its members. ' +
	"If a trip's AI access is off, say so plainly.";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildServer(ctx: McpContext): McpServer {
	return new McpServer({ name: 'waypoint', version: '3.1.0' }, { instructions: INSTRUCTIONS });
}
