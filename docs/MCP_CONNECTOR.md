# Waypoint in Claude (MCP connector)

Waypoint 3.1 lets a trip member ask Claude about their trips. Claude reads Waypoint as you: it sees the trips you're a member of, at your role, and nothing else. It can't change anything yet (writes are v3.2).

## Connect (once per Claude account)

1. On **claude.ai** (web), open **Settings → Connectors → Add custom connector**.
2. Name: `Waypoint`. URL: `https://app.vandenwarsen.com/mcp`. Leave the OAuth fields empty: Waypoint identifies Claude by its client metadata document.
3. Click **Connect**. A Waypoint page asks for your email, then the 6-digit code it emails you. After the code, you're sent back to Claude.
4. In the connector's settings, set every Waypoint tool to **Always allow**. They are all read-only.
5. The connector then works in the Claude iPhone app too (add it on the web first).

## Ask

Examples: "Which hotel did we stay at in Lucerne?", "What's tomorrow on the Portugal trip?", "What still needs booking?", "Who owes whom?", "Brief me for today."

Answers come back as Waypoint-style cards. Times are the trip's local time.

## What Claude never sees

- Email addresses, of anyone. Members appear by display name.
- Photos and uploaded files. Memories come through as their text only; documents as their confirmation codes only.
- Suggestions that aren't approved, and anything on a trip you aren't a member of.
- Trips whose owner turned **AI Access** off (Trip settings). Claude sees only the trip's name and dates, and says AI access is off.

## Disconnect

Waypoint → **Account → Connected apps → Disconnect**. Claude's access ends at its next request. Removing the connector in Claude doesn't revoke Waypoint's side; use Disconnect for that.

## Tools

| Tool | Returns |
|---|---|
| `list_trips` | Your trips, with your role and AI Access state |
| `trip_brief` | Now on a trip: where, what's on now and next, tonight's lodging, today's and tomorrow's codes |
| `get_trip` | Phases, nightly lodging, members, goals, ideas with votes |
| `get_day` | One day: stays, items in timeline order, day notes |
| `search` | Items, day notes, codes, expenses, goals across trips, with filters |
| `get_item` | One item in full: codes, comments, who's going, votes, expenses |
| `get_money` | Balances, who owes whom, budget, spend by category |
| `audit_trip` | What's missing: nights without lodging, unbooked, code-less flights, overlaps, ideas, open tasks |
| `what_changed` | What was added or edited since a time |
| `get_lists` | Checklists and tasks, with assignees |
| `get_memories` | Memory thoughts by day |
