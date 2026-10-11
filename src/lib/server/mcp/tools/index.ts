import { auditTripTool } from './audit-trip';
import { describe } from './describe';
import { proposeChanges } from './propose-changes';
import { commitChanges } from './commit-changes';
import { getDay } from './get-day';
import { getLists } from './get-lists';
import { getMemories } from './get-memories';
import { getItem } from './get-item';
import { getMoney } from './get-money';
import { getTrip } from './get-trip';
import { listTrips } from './list-trips';
import { search } from './search';
import { tripBrief } from './trip-brief';
import { whatChanged } from './what-changed';
import type { ToolDef } from './types';

export const TOOLS: ToolDef[] = [listTrips, getTrip, getDay, search, getItem, getMoney, auditTripTool, whatChanged, getLists, getMemories, tripBrief];

/** #503 — the write surface; registered only while MCP_WRITES is on. */
export const WRITE_TOOLS: ToolDef[] = [describe, proposeChanges, commitChanges];
