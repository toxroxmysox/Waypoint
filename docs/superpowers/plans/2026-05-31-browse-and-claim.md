# Browse-and-Claim for Name-Only Placeholders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user joining a trip via invite claim an existing name-only placeholder instead of creating a duplicate member record.

**Architecture:** Extend the PocketBase invite lookup endpoint to return unclaimed name-only placeholders (when authenticated), and extend the invite accept endpoint to accept an optional `claim_placeholder` member ID. The SvelteKit invite page renders the placeholder list inline when available — no new routes or components needed.

**Tech Stack:** PocketBase hooks (Go-flavored JS), SvelteKit (+page.server.ts / +page.svelte), Tailwind v4

**Issue:** #13

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/pb_hooks/invites.pb.js` | Modify | Add placeholder query to lookup; add claim_placeholder path to accept |
| `src/routes/invite/[code]/+page.server.ts` | Modify | Pass placeholders from lookup to page; send claim_placeholder in accept action |
| `src/routes/invite/[code]/+page.svelte` | Modify | Render placeholder selection list in match state |

---

### Task 1: Extend invite lookup to return unclaimed placeholders

**Files:**
- Modify: `backend/pb_hooks/invites.pb.js:140-193` (the `POST /api/invites/lookup` handler)

The lookup endpoint is anon-accessible. We only return placeholders when the caller is authenticated AND their email matches the invite email — otherwise the response is unchanged.

- [ ] **Step 1: Add placeholder query to the lookup handler**

In `backend/pb_hooks/invites.pb.js`, replace the return statement at the end of the lookup handler (lines 186-192) with auth-aware placeholder fetching:

```js
	// Return base metadata for anon callers or email-mismatch.
	const baseResponse = {
		email: invite.getString('email'),
		role: invite.getString('role'),
		trip_title: tripTitle,
		inviter_name: inviterName,
		expired: expired,
		unclaimed_placeholders: []
	};

	// Only fetch placeholders for authenticated users whose email matches.
	const auth = e.auth;
	if (!auth || expired) {
		return e.json(200, baseResponse);
	}

	const authEmail = (auth.email() || '').trim().toLowerCase();
	const lookupEmail = invite.getString('email').trim().toLowerCase();
	if (authEmail !== lookupEmail) {
		return e.json(200, baseResponse);
	}

	// Find name-only placeholders: no user, no email, just a display name.
	const tripId = invite.getString('trip');
	let placeholders = [];
	try {
		placeholders = e.app.findRecordsByFilter(
			'trip_members',
			'trip = {:tripId} && user = "" && placeholder_email = ""',
			'',
			0,
			0,
			{ tripId: tripId }
		);
	} catch (_) {
		// No placeholders; fine.
	}

	const unclaimedPlaceholders = [];
	for (const p of placeholders) {
		const name = p.getString('display_name') || p.getString('placeholder_name') || '';
		if (!name) continue;
		unclaimedPlaceholders.push({
			member_id: p.id,
			display_name: name,
			role: p.getString('role')
		});
	}

	baseResponse.unclaimed_placeholders = unclaimedPlaceholders;
	return e.json(200, baseResponse);
```

- [ ] **Step 2: Test manually with curl**

Start the backend with `./backend/start.sh`. Test three scenarios:

```bash
# Anon — should return empty unclaimed_placeholders
curl -s -X POST http://localhost:8090/api/invites/lookup \
  -H 'Content-Type: application/json' \
  -d '{"code":"VALID_CODE"}' | jq .unclaimed_placeholders

# Auth + email match — should return placeholders if any exist
curl -s -X POST http://localhost:8090/api/invites/lookup \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TOKEN' \
  -d '{"code":"VALID_CODE"}' | jq .unclaimed_placeholders

# Auth + email mismatch — should return empty
curl -s -X POST http://localhost:8090/api/invites/lookup \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer WRONG_USER_TOKEN' \
  -d '{"code":"VALID_CODE"}' | jq .unclaimed_placeholders
```

- [ ] **Step 3: Commit**

```bash
git add backend/pb_hooks/invites.pb.js
git commit -m "feat(#13): return unclaimed name-only placeholders in invite lookup"
```

---

### Task 2: Extend invite accept to support claim_placeholder

**Files:**
- Modify: `backend/pb_hooks/invites.pb.js:195-306` (the `POST /api/invites/accept` handler)

Add a third claim path: if `claim_placeholder` is provided in the request body, validate and claim that placeholder instead of creating a new member. Existing email-match claiming and new-member-creation paths remain unchanged.

- [ ] **Step 1: Add claim_placeholder handling after the existing-member check**

In `backend/pb_hooks/invites.pb.js`, insert the new path between the already-member short-circuit (line 258) and the existing placeholder-claim-by-email path (line 260). Replace lines 260-296 with:

```js
	// Name-only placeholder claim path: user explicitly selected a placeholder
	// from the browse-and-claim UI during invite acceptance.
	const claimPlaceholderId = (info.body && info.body['claim_placeholder']) || '';
	if (claimPlaceholderId) {
		let target;
		try {
			target = e.app.findRecordById('trip_members', claimPlaceholderId);
		} catch (_) {
			throw new BadRequestError('Placeholder not found');
		}

		// Validate: belongs to the same trip.
		if (target.getString('trip') !== tripId) {
			throw new BadRequestError('Placeholder does not belong to this trip');
		}
		// Validate: actually unclaimed (no user, no placeholder_email).
		if (target.getString('user')) {
			throw new BadRequestError('This placeholder has already been claimed');
		}
		if (target.getString('placeholder_email')) {
			throw new BadRequestError('This placeholder is managed by email matching');
		}

		const joinedAt =
			new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';
		target.set('user', auth.id);
		target.set('joined_at', joinedAt);
		target.set('placeholder_name', '');
		e.app.save(target);

		e.app.delete(invite);
		return e.json(200, {
			trip_id: tripId,
			member_id: target.id,
			already_member: false
		});
	}

	// Placeholder-claim path: if there's a placeholder row matching this email,
	// claim it (set user, clear placeholder fields, set joined_at). Otherwise
	// create a fresh trip_members row with the invited role.
	let placeholder = null;
	try {
		placeholder = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && placeholder_email = {:email}',
			{ tripId: tripId, email: inviteEmail }
		);
	} catch (_) {
		// No placeholder; fine.
	}

	const joinedAt =
		new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';

	let member;
	if (placeholder) {
		placeholder.set('user', auth.id);
		placeholder.set('placeholder_email', '');
		placeholder.set('joined_at', joinedAt);
		e.app.save(placeholder);
		member = placeholder;
	} else {
		const tripMembersCol = e.app.findCollectionByNameOrId('trip_members');
		member = new Record(tripMembersCol);
		member.set('trip', tripId);
		member.set('user', auth.id);
		member.set('role', invite.getString('role'));
		member.set('joined_at', joinedAt);
		e.app.save(member);
	}

	// Remove the consumed invite.
	e.app.delete(invite);

	return e.json(200, {
		trip_id: tripId,
		member_id: member.id,
		already_member: false
	});
```

- [ ] **Step 2: Test manually with curl**

```bash
# Accept with claim_placeholder — should claim the placeholder
curl -s -X POST http://localhost:8090/api/invites/accept \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TOKEN' \
  -d '{"code":"VALID_CODE","claim_placeholder":"PLACEHOLDER_MEMBER_ID"}' | jq .

# Accept with invalid placeholder ID — should 400
curl -s -X POST http://localhost:8090/api/invites/accept \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TOKEN' \
  -d '{"code":"VALID_CODE","claim_placeholder":"nonexistent"}' | jq .

# Accept without claim_placeholder — should behave as before (create new member)
curl -s -X POST http://localhost:8090/api/invites/accept \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer TOKEN' \
  -d '{"code":"VALID_CODE"}' | jq .
```

- [ ] **Step 3: Commit**

```bash
git add backend/pb_hooks/invites.pb.js
git commit -m "feat(#13): support claim_placeholder in invite accept"
```

---

### Task 3: Wire up the SvelteKit invite page server

**Files:**
- Modify: `src/routes/invite/[code]/+page.server.ts`

Pass unclaimed placeholders from the lookup response to the page data. Add `claim_placeholder` to the accept form action.

- [ ] **Step 1: Add placeholders to load function return data**

In `src/routes/invite/[code]/+page.server.ts`, the load function calls `/api/invites/lookup`. The response now includes `unclaimed_placeholders`. Update the return to pass them through.

Replace the `return` block (lines 54-62) with:

```ts
	return {
		code: params.code,
		status,
		email: lookup.email || '',
		role: lookup.role || '',
		tripTitle: lookup.trip_title || '',
		authEmail: locals.user?.email ?? '',
		unclaimedPlaceholders: (lookup.unclaimed_placeholders ?? []) as {
			member_id: string;
			display_name: string;
			role: string;
		}[]
	};
```

Also update the `not_found` early return (lines 34-40) to include the field:

```ts
		return {
			code: params.code,
			status: 'not_found' as InviteStatus,
			email: '',
			role: '',
			tripTitle: '',
			authEmail: locals.user?.email ?? '',
			unclaimedPlaceholders: []
		};
```

- [ ] **Step 2: Update the lookup fetch to pass auth token**

The lookup call (lines 19-26) currently uses SvelteKit's `fetch` with no auth header. PB needs the auth token to return placeholders. Update to pass the token if the user is authenticated:

```ts
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (locals.pb.authStore.token) {
		headers['Authorization'] = `Bearer ${locals.pb.authStore.token}`;
	}
	try {
		const res = await fetch(PUBLIC_PB_URL + '/api/invites/lookup', {
			method: 'POST',
			headers,
			body: JSON.stringify({ code: params.code })
		});
```

- [ ] **Step 3: Add claim_placeholder to the accept action**

In the `accept` action (lines 65-82), read the optional `claim_placeholder` from form data and pass it to the PB endpoint:

```ts
	accept: async ({ params, locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated.' });

		const formData = await request.formData();
		const claimPlaceholder = formData.get('claim_placeholder')?.toString() || '';

		try {
			const body: Record<string, string> = { code: params.code };
			if (claimPlaceholder) {
				body.claim_placeholder = claimPlaceholder;
			}
			const res = await locals.pb.send<{ trip_id: string }>('/api/invites/accept', {
				method: 'POST',
				body
			});
			const trip = await locals.pb.collection('trips').getOne<{ slug: string }>(res.trip_id);
			redirect(303, `/trips/${trip.slug}`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && 'location' in err) throw err;
			const message = extractErrorMessage(err) || 'Failed to accept invite.';
			return fail(400, { error: message });
		}
	},
```

- [ ] **Step 4: Run `pnpm check`**

```bash
pnpm check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/routes/invite/[code]/+page.server.ts
git commit -m "feat(#13): wire placeholder data and claim_placeholder through invite page server"
```

---

### Task 4: Render placeholder selection in the invite UI

**Files:**
- Modify: `src/routes/invite/[code]/+page.svelte`

Add the inline placeholder list to the `match` status block. When placeholders exist, show a selectable list above the accept button. When the user picks one, its `member_id` is sent as `claim_placeholder` in the accept form.

- [ ] **Step 1: Add state for selected placeholder**

In the `<script>` block, add:

```ts
	let selectedPlaceholder = $state<string | null>(null);
	const placeholders = $derived(data.unclaimedPlaceholders ?? []);
```

- [ ] **Step 2: Add the placeholder list to the match block**

In the `{:else if data.status === 'match'}` block (line 76), after the intro text and before the error/form section, add the placeholder selection UI:

```svelte
			{#if placeholders.length > 0}
				<div class="mt-6 space-y-2">
					<p class="text-ink-soft text-sm">
						Were you already added to this trip?
					</p>

					{#each placeholders as ph (ph.member_id)}
						<button
							type="button"
							class="border-line w-full rounded-lg border p-3 text-left transition-colors
								{selectedPlaceholder === ph.member_id
									? 'border-moss bg-moss-tint'
									: 'bg-surface hover:bg-surface-2'}"
							onclick={() => {
								selectedPlaceholder = selectedPlaceholder === ph.member_id ? null : ph.member_id;
							}}
						>
							<span class="text-ink font-medium">{ph.display_name}</span>
							<span class="text-ink-muted ml-1 text-sm">
								{roleLabel[ph.role] ?? ph.role}
							</span>
						</button>
					{/each}
				</div>
			{/if}
```

- [ ] **Step 3: Update the accept form to include claim_placeholder**

In the existing accept form (around line 95), add the hidden input and update the button label:

```svelte
			<form
				method="POST"
				action="?/accept"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="mt-6"
			>
				{#if selectedPlaceholder}
					<input type="hidden" name="claim_placeholder" value={selectedPlaceholder} />
				{/if}
				<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="w-full">
					{#if loading}
						Joining…
					{:else if selectedPlaceholder}
						Join as {placeholders.find(p => p.member_id === selectedPlaceholder)?.display_name}
					{:else}
						Accept invite
					{/if}
				</Button>
			</form>

			{#if placeholders.length > 0 && !selectedPlaceholder}
				<p class="text-ink-muted mt-2 text-center text-xs">
					None of those are me — join as a new member
				</p>
			{/if}
```

- [ ] **Step 4: Run `pnpm check`**

```bash
pnpm check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/routes/invite/[code]/+page.svelte
git commit -m "feat(#13): render placeholder selection list on invite page"
```

---

### Task 5: Visual verification

**Files:** None (testing only)

- [ ] **Step 1: Start dev servers**

```bash
./backend/start.sh &
pnpm dev
```

- [ ] **Step 2: Create test data**

Using the PB admin UI or dev login:
1. Create a trip
2. Add 2 name-only placeholder members (e.g. "Greg" as traveler, "Abby" as co_owner)
3. Send an invite to a test email

- [ ] **Step 3: Test the invite page at mobile (375px)**

Navigate to `/invite/[code]` as the invited user. Verify:
- [ ] Placeholder list appears after auth with "Were you already added to this trip?"
- [ ] Each placeholder shows name + role
- [ ] Selecting a placeholder highlights it with moss border
- [ ] Deselecting (re-click) removes highlight
- [ ] "Join as [Name]" button label updates when placeholder is selected
- [ ] "Accept invite" button label shows when no placeholder is selected
- [ ] "None of those are me" hint appears when placeholders exist but none selected
- [ ] Accepting with a placeholder selected claims it (check DB: user is set, placeholder_name cleared)
- [ ] Accepting without a placeholder selected creates a new member (existing behavior)
- [ ] After acceptance, redirect to the trip works

- [ ] **Step 4: Test with no placeholders**

Create an invite on a trip with no name-only placeholders. Verify the invite page looks identical to the current production page — no placeholder section rendered.

- [ ] **Step 5: Test edge case — placeholder claimed between load and accept**

1. Load the invite page (placeholders appear)
2. In another tab/via PB admin, delete or claim one of the placeholders
3. Try to accept with that placeholder selected
4. Should get a 400 error displayed inline — not a crash

- [ ] **Step 6: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(#13): polish from visual verification"
```
