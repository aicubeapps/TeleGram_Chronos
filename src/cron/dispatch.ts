import { getDueReminders, markSent, getRecurringDue, updateNextFire } from "../db/reminders";
import { sendMessage, InlineKeyboardButton } from "../telegram";
import { calculateNextFire, recurrenceCategoryWord } from "../utils/recurrence";

export const SNOOZE_OPTIONS: { label: string; minutes: number }[] = [
	{ label: "15m", minutes: 15 },
	{ label: "30m", minutes: 30 },
	{ label: "1hr", minutes: 60 },
	{ label: "2hr", minutes: 120 },
	{ label: "4hr", minutes: 240 },
	{ label: "24hr", minutes: 1440 },
];

export interface CronResult {
	dispatched: number;
	failed: number;
	recurringDispatched: number;
	recurringFailed: number;
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

export async function dispatchCron(env: Env): Promise<CronResult> {
	const oneTime = await dispatchOneTime(env);
	const recurring = await dispatchRecurring(env);

	return {
		dispatched: oneTime.dispatched,
		failed: oneTime.failed,
		recurringDispatched: recurring.dispatched,
		recurringFailed: recurring.failed,
	};
}
