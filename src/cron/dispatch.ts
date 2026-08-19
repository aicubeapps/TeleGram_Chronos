import { getDueReminders, markSent, getRecurringDue, updateNextFire, getDueListReminders } from "../db/reminders";
import { deleteExpiredNotes } from "../db/notes";
import { getListItems } from "../db/lists";
import { chunkButtons } from "../commands/lists";
import { sendMessage, InlineKeyboardButton } from "../telegram";
import { calculateNextFire, recurrenceCategoryWord } from "../utils/recurrence";

export const SNOOZE_OPTIONS: { label: string; minutes: number }[] = [
	{ label: "15m", minutes: 15 },
	{ label: "30m", minutes: 30 },
	{ label: "1h", minutes: 60 },
	{ label: "2h", minutes: 120 },
	{ label: "4h", minutes: 240 },
	{ label: "24h", minutes: 1440 },
];

export interface CronResult {
	dispatched: number;
	failed: number;
	recurringDispatched: number;
	recurringFailed: number;
	listDispatched: number;
	listFailed: number;
	expiredNotesDeleted: number;
}

async function dispatchOneTime(env: Env): Promise<{ dispatched: number; failed: number }> {
	let dispatched = 0;
	let failed = 0;

	let due;
	try {
		due = await getDueReminders(env.DB);
	} catch (err) {
		console.error("Cron: getDueReminders failed:", err);
		return { dispatched, failed };
	}

	for (const reminder of due) {
		try {
			const keyboard: InlineKeyboardButton[][] = [
				SNOOZE_OPTIONS.map((opt) => ({ text: opt.label, callback_data: `snooze:${reminder.id}:${opt.minutes}` })),
				[{ text: "✅ Mark Complete", callback_data: `complete:${reminder.id}` }],
			];

			const ok = await sendMessage(env.TELEGRAM_BOT_TOKEN, reminder.chat_id, `⏰ Reminder: ${reminder.message}`, keyboard);

			if (ok) {
				await markSent(env.DB, reminder.id);
				dispatched++;
			} else {
				failed++;
			}
		} catch (err) {
			console.error(`Cron: failed to dispatch reminder #${reminder.id}:`, err);
			failed++;
		}
	}

	return { dispatched, failed };
}

async function dispatchRecurring(env: Env): Promise<{ dispatched: number; failed: number }> {
	let dispatched = 0;
	let failed = 0;

	let due;
	try {
		due = await getRecurringDue(env.DB);
	} catch (err) {
		console.error("Cron: getRecurringDue failed:", err);
		return { dispatched, failed };
	}

	for (const reminder of due) {
		try {
			const rule = reminder.recurrence_rule as string;
			const label = recurrenceCategoryWord(rule);

			const keyboard: InlineKeyboardButton[][] = [
				SNOOZE_OPTIONS.map((opt) => ({ text: opt.label, callback_data: `snooze:${reminder.id}:${opt.minutes}` })),
				[
					{ text: "✅ Done this time", callback_data: `done_once:${reminder.id}` },
					{ text: "🚫 Stop recurring", callback_data: `stop_recurring:${reminder.id}` },
				],
			];

			const ok = await sendMessage(env.TELEGRAM_BOT_TOKEN, reminder.chat_id, `🔁 ${label}: ${reminder.message}`, keyboard);

			if (ok) {
				const nextFire = calculateNextFire(rule, reminder.next_fire as string);
				await updateNextFire(env.DB, reminder.id, nextFire);
				dispatched++;
			} else {
				failed++;
			}
		} catch (err) {
			console.error(`Cron: failed to dispatch recurring reminder #${reminder.id}:`, err);
			failed++;
		}
	}

	return { dispatched, failed };
}

async function dispatchListReminders(env: Env): Promise<{ dispatched: number; failed: number }> {
	let dispatched = 0;
	let failed = 0;

	let due;
	try {
		due = await getDueListReminders(env.DB);
	} catch (err) {
		console.error("Cron: getDueListReminders failed:", err);
		return { dispatched, failed };
	}

	for (const reminder of due) {
		try {
			const listId = reminder.linked_list_id as number;
			const listName = reminder.list_name ?? "List";
			const snoozeRow = SNOOZE_OPTIONS.map((opt) => ({ text: opt.label, callback_data: `snooze:${reminder.id}:${opt.minutes}` }));
			let ok: boolean;

			if (reminder.linked_item_id === null) {
				const items = await getListItems(env.DB, listId);
				const pending = items.filter((i) => i.completed === 0);

				const lines = [`🔔 Reminder: ${listName} List`, `${pending.length} items pending:`];
				for (const item of pending) lines.push(`• ${item.item}`);

				const itemButtons: InlineKeyboardButton[] = pending.map((item) => ({
					text: `✅ ${item.item}`,
					callback_data: `item_done:${item.id}:${listId}`,
				}));

				const keyboard: InlineKeyboardButton[][] = [
					...chunkButtons(itemButtons, 3),
					snoozeRow,
					[{ text: "📋 Show Full List", callback_data: `show_list:${listId}` }],
				];

				ok = await sendMessage(env.TELEGRAM_BOT_TOKEN, reminder.chat_id, lines.join("\n"), keyboard);
			} else {
				const itemText = reminder.item_text ?? "";
				const keyboard: InlineKeyboardButton[][] = [
					[
						{ text: "✅ Done", callback_data: `item_done:${reminder.linked_item_id}:${listId}` },
						{ text: "📋 Show Full List", callback_data: `show_list:${listId}` },
					],
					snoozeRow,
				];

				ok = await sendMessage(env.TELEGRAM_BOT_TOKEN, reminder.chat_id, `🔔 ${listName} List — ${itemText}`, keyboard);
			}

			if (ok) {
				await markSent(env.DB, reminder.id);
				dispatched++;
			} else {
				failed++;
			}
		} catch (err) {
			console.error(`Cron: failed to dispatch list reminder #${reminder.id}:`, err);
			failed++;
		}
	}

	return { dispatched, failed };
}

async function cleanupExpiredNotes(env: Env): Promise<number> {
	try {
		return await deleteExpiredNotes(env.DB);
	} catch (err) {
		console.error("Cron: deleteExpiredNotes failed:", err);
		return 0;
	}
}

async function cleanupExpiredShareTokens(env: Env): Promise<void> {
	try {
		await env.DB.prepare(`DELETE FROM share_tokens WHERE expires_at <= datetime('now')`).run();
	} catch (err) {
		console.error("Cron: cleanupExpiredShareTokens failed:", err);
	}
}

export async function dispatchCron(env: Env): Promise<CronResult> {
	const oneTime = await dispatchOneTime(env);
	const recurring = await dispatchRecurring(env);
	const listReminders = await dispatchListReminders(env);
	const expiredNotesDeleted = await cleanupExpiredNotes(env);
	await cleanupExpiredShareTokens(env);

	return {
		dispatched: oneTime.dispatched,
		failed: oneTime.failed,
		recurringDispatched: recurring.dispatched,
		recurringFailed: recurring.failed,
		listDispatched: listReminders.dispatched,
		listFailed: listReminders.failed,
		expiredNotesDeleted,
	};
}
