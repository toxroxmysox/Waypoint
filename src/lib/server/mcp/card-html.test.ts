import { describe, it, expect } from 'vitest';
import { CARD_HTML } from './card-html';

// #520 — run the card's script against a fake host: Confirm must never stick on "Saving…".
function mount() {
	const js = CARD_HTML.split('<script>')[1].split('</script>')[0];
	const listeners: ((ev: { data: unknown }) => void)[] = [];
	const els: Record<string, { disabled: boolean; textContent: string; onclick?: () => void }> = {};
	let html = '';
	const root = {
		className: '',
		get innerHTML() {
			return html;
		},
		set innerHTML(h: string) {
			html = h;
			if (h.includes('id="ok"')) els.ok = { disabled: false, textContent: 'Confirm' };
		}
	};
	const env = {
		window: {
			parent: { postMessage: () => {} },
			addEventListener: (_: string, f: (ev: { data: unknown }) => void) => listeners.push(f)
		},
		document: {
			getElementById: (i: string) => (i === 'root' ? root : els[i]),
			documentElement: { scrollHeight: 100, dataset: {} }
		},
		setTimeout,
		clearTimeout
	};
	new Function(...Object.keys(env), js)(...Object.values(env));
	const msg = (data: object) => listeners.forEach((f) => f({ data: { jsonrpc: '2.0', ...data } }));
	return { msg, els, html: () => html };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

async function confirmShown() {
	const card = mount();
	card.msg({ id: 1, result: { hostCapabilities: { serverTools: {} } } });
	await tick();
	card.msg({
		method: 'ui/notifications/tool-result',
		params: {
			structuredContent: { cards: [], proposal: { id: 'p1', quote: 'q', outcome: 'Saved' } }
		}
	});
	card.els.ok.onclick!();
	expect(card.els.ok.textContent).toBe('Saving…');
	return card;
}

describe('card Confirm (#520)', () => {
	it('re-arms the button when the host answers with an error', async () => {
		const card = await confirmShown();
		card.msg({ id: 2, error: { code: -32000, message: 'boom' } });
		await tick();
		expect(card.els.ok).toMatchObject({
			disabled: false,
			textContent: 'Could not save — tap to try again'
		});
	});

	it('shows a tool error and lets it be retried', async () => {
		const card = await confirmShown();
		card.msg({
			id: 2,
			result: { isError: true, content: [{ type: 'text', text: 'Changed since.' }] }
		});
		await tick();
		expect(card.els.ok).toMatchObject({ disabled: false, textContent: 'Changed since.' });
	});

	it('renders the saved result', async () => {
		const card = await confirmShown();
		card.msg({ id: 2, result: { structuredContent: { heading: 'Saved', cards: [] } } });
		await tick();
		expect(card.html()).toContain('<h2>Saved</h2>');
	});
});
