import { getDueReminders, markSent } from "../db/reminders";
import { sendMessage, InlineKeyboardButton } from "../telegram";

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
}

export async function dispatchCron(env: Env): Promise<CronResult> {
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
