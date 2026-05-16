import type { Expense, Settlement, SplitDataEqual, SplitDataByAmount } from '$lib/types';

export interface DebtEdge {
	from: string;
	to: string;
	amount: number;
}

export function computeBalances(
	expenses: Expense[],
	settlements: Settlement[]
): Map<string, number> {
	const balances = new Map<string, number>();

	const addBalance = (memberId: string, amount: number) => {
		balances.set(memberId, (balances.get(memberId) ?? 0) + amount);
	};

	for (const expense of expenses) {
		const payer = expense.paid_by;
		const amount = expense.amount_usd;

		addBalance(payer, amount);

		if (expense.split_mode === 'equal') {
			const data = expense.split_data as SplitDataEqual;
			const share = amount / data.members.length;
			for (const memberId of data.members) {
				addBalance(memberId, -share);
			}
		} else if (expense.split_mode === 'by_amount') {
			const data = expense.split_data as SplitDataByAmount;
			for (const [memberId, owed] of Object.entries(data.amounts)) {
				addBalance(memberId, -owed);
			}
		}
	}

	for (const settlement of settlements) {
		addBalance(settlement.from_member, settlement.amount_usd);
		addBalance(settlement.to_member, -settlement.amount_usd);
	}

	return balances;
}

export function simplifyDebts(
	expenses: Expense[],
	settlements: Settlement[]
): DebtEdge[] {
	const balances = computeBalances(expenses, settlements);

	const creditors: { id: string; amount: number }[] = [];
	const debtors: { id: string; amount: number }[] = [];

	for (const [id, balance] of balances) {
		if (balance > 0.005) {
			creditors.push({ id, amount: balance });
		} else if (balance < -0.005) {
			debtors.push({ id, amount: -balance });
		}
	}

	creditors.sort((a, b) => b.amount - a.amount);
	debtors.sort((a, b) => b.amount - a.amount);

	const result: DebtEdge[] = [];

	let ci = 0;
	let di = 0;
	while (ci < creditors.length && di < debtors.length) {
		const creditor = creditors[ci];
		const debtor = debtors[di];

		const transfer = Math.min(creditor.amount, debtor.amount);
		if (transfer > 0.005) {
			result.push({
				from: debtor.id,
				to: creditor.id,
				amount: Math.round(transfer * 100) / 100,
			});
		}

		creditor.amount -= transfer;
		debtor.amount -= transfer;

		if (creditor.amount < 0.005) ci++;
		if (debtor.amount < 0.005) di++;
	}

	return result;
}
