// #502 — what every MCP tool runs with: the connected user's own PB client (PB
// rules = their Role, ADR-0024 §1), who they are, and "now".
import type PocketBase from 'pocketbase';

export interface McpContext {
	pb: PocketBase;
	user: { id: string; name: string };
	now: Date;
}
