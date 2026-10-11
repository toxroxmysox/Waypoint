import { auditTripTool } from './audit-trip';
import { getDay } from './get-day';
import { getLists } from './get-lists';
import { getMemories } from './get-memories';
import { getItem } from './get-item';
import { getMoney } from './get-money';
import { getTrip } from './get-trip';
import { listTrips } from './list-trips';
import { search } from './search';
import { whatChanged } from './what-changed';
import type { ToolDef } from './types';

export const TOOLS: ToolDef[] = [listTrips, getTrip, getDay, search, getItem, getMoney, auditTripTool, whatChanged, getLists, getMemories];
