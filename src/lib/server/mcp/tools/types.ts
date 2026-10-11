import type { ZodRawShape } from 'zod';
import type { McpContext } from '../context';
import type { ToolResult } from '../present';

export interface ToolDef {
	name: string;
	title: string;
	description: string;
	inputSchema: ZodRawShape;
	/** #503 — part of the write surface: listed only while MCP_WRITES is on. */
	write?: true;
	/** #503 — changes data (readOnlyHint false). */
	mutates?: true;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	run(ctx: McpContext, args: any): Promise<ToolResult>;
}
