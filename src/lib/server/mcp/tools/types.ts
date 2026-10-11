import type { ZodRawShape } from 'zod';
import type { McpContext } from '../context';
import type { ToolResult } from '../present';

export interface ToolDef {
	name: string;
	title: string;
	description: string;
	inputSchema: ZodRawShape;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	run(ctx: McpContext, args: any): Promise<ToolResult>;
}
