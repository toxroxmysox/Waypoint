import { getDay } from './get-day';
import { getTrip } from './get-trip';
import { listTrips } from './list-trips';
import type { ToolDef } from './types';

export const TOOLS: ToolDef[] = [listTrips, getTrip, getDay];
