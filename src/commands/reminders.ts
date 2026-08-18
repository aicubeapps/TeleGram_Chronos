import { insertReminder, insertRecurring, listPending, deleteReminder, getReminder } from "../db/reminders";
import { sendMessage } from "../telegram";
import { parseReminderDateTime, formatIST } from "../utils/datetime";
import { parseRecurringCommand, firstFireAfter, recurrencePhraseShort, formatRecurrenceListLine } from "../utils/recurrence";

export const HELP_TEXT = [
	"Available commands:",
	"",
	"/remind <date> <HH:MM> <message> — set a one-time reminder",
	"    date: +N (days from today), YYYY-MM-DD, or DD-MMM-YYYY",
	"    example: /remind +7 09:00 Submit MIS report",
	"    example: /remind 2026-09-15 10:00 Team review meeting",
	"",
	"/remind every <weekday> <HH:MM> <message> — weekly reminder",
	"    example: /remind every monday 09:00 Weekly MIS update",
	"/remind every month <day> <HH:MM> <message> — monthly reminder",
	"    example: /remind every month 1 10:00 Submit attendance",
	"/remind every day <HH:MM> <message> — daily reminder",
	"    example: /remind every day 08:00 Morning standup",
	"/remind yearly <MM-DD> <HH:MM> <message> — yearly reminder",
	"    example: /remind yearly 09-15 09:00 Dad's birthday",
	"",
	"/list — show your pending reminders, grouped by overdue/today/upcoming/recurring",
	"/delete <id> — delete a reminder, e.g. /delete 3",
	"/help — show this message",
].join("\n");

const REMIND_USAGE = "Usage: /remind <date> <HH:MM> <message>\nExample: /remind +7 09:00 Submit MIS report";
const RECURRING_USAGE = [
	"Usage:",
	"/remind every <weekday> <HH:MM> <message>",
	"/remind every month <day> <HH:MM> <message>",
	"/remind every day <HH:MM> <message>",
	"/remind yearly <MM-DD> <HH:MM> <message>",
	"Example: /remind every monday 09:00 Weekly MIS update",
].join("\n");
const DELETE_USAGE = "Usage: /delete <id>\nExample: /delete 3";
const GENERIC_ERROR = "Something went wrong, try again";

export async function handleStart(env: Env, chatId: number): Promise<void> {
	await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `👋 Welcome to Chronos!\n\n${HELP_TEXT}`);
}

export async function handleRemind(env: Env, chatId: number, text: string): Promise<void> {
	const tokens = text.trim().split(/\s+/).slice(1);
	const keyword = (tokens[0] ?? "").toLowerCase();

	if (keyword === "every" || keyword === "yearly") {
		const recurring = parseRecurringCommand(tokens);
		if (!recurring) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, RECURRING_USAGE);
			return;
		}

		try {
			const nextFire = firstFireAfter(recurring.rule, recurring.hour, recurring.minute);
			const id = await insertRecurring(env.DB, String(chatId), recurring.message, recurring.rule, nextFire);
			const phrase = recurrencePhraseShort(recurring.rule);
			const { dateLabel, timeLabel } = formatIST(nextFire);
			await sendMessage(
				env.TELEGRAM_BOT_TOKEN,
				chatId,
				`✅ Recurring reminder #${id} set: ${phrase}\nNext: ${dateLabel} ${timeLabel} IST\n"${recurring.message}"`,
			);
		} catch (err) {
			console.error("handleRemind: insertRecurring failed:", err);
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
		}
		return;
	}

	if (tokens.length < 3) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, REMIND_USAGE);
		return;
	}

	const [dateStr, timeStr, ...messageParts] = tokens;
	const message = messageParts.join(" ");
	const remindOn = parseReminderDateTime(dateStr, timeStr);

	if (!remindOn || !message) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, REMIND_USAGE);
		return;
	}

	try {
		const id = await insertReminder(env.DB, String(chatId), message, remindOn);
		const { dateLabel, timeLabel } = formatIST(remindOn);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Reminder #${id} set for ${dateLabel} ${timeLabel} IST\n"${message}"`);
	} catch (err) {
		console.error("handleRemind: insertReminder failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleList(env: Env, chatId: number): Promise<void> {
	try {
		const grouped = await listPending(env.DB, String(chatId));

		if (
			grouped.overdue.length === 0 &&
			grouped.today.length === 0 &&
			grouped.upcoming.length === 0 &&
			grouped.recurring.length === 0
		) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "You have no pending reminders.");
			return;
		}

		const lines: string[] = [];

		if (grouped.overdue.length > 0) {
			lines.push("⚠️ Overdue (snoozed or missed):");
			for (const r of grouped.overdue) {
				const { dateLabel, timeLabel } = formatIST(r.snoozed_until ?? r.remind_on);
				lines.push(`- #${r.id} ${r.message} — was ${dateLabel} ${timeLabel}`);
			}
			lines.push("");
		}

		if (grouped.today.length > 0) {
			lines.push("📅 Today:");
			for (const r of grouped.today) {
				const { timeLabel } = formatIST(r.snoozed_until ?? r.remind_on);
				lines.push(`- #${r.id} ${r.message} — ${timeLabel}`);
			}
			lines.push("");
		}

		if (grouped.upcoming.length > 0) {
			lines.push("🗓 Upcoming:");
			for (const r of grouped.upcoming) {
				const { dateLabel, timeLabel } = formatIST(r.snoozed_until ?? r.remind_on);
				lines.push(`- #${r.id} ${r.message} — ${dateLabel} ${timeLabel}`);
			}
			lines.push("");
		}

		if (grouped.recurring.length > 0) {
			lines.push("🔁 Recurring:");
			for (const r of grouped.recurring) {
				const detail = formatRecurrenceListLine(r.recurrence_rule as string, r.next_fire as string);
				lines.push(`- #${r.id} ${r.message} — ${detail}`);
			}
		}

		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n").trim());
	} catch (err) {
		console.error("handleList: listPending failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleDelete(env: Env, chatId: number, text: string): Promise<void> {
	const parts = text.trim().split(/\s+/);
	if (parts.length !== 2 || !/^\d+$/.test(parts[1])) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, DELETE_USAGE);
		return;
	}

	const id = parseInt(parts[1], 10);

	try {
		const reminder = await getReminder(env.DB, id);
		if (!reminder || reminder.chat_id !== String(chatId)) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Reminder #${id} not found.`);
			return;
		}

		if (reminder.recurrence_rule) {
			const phrase = recurrencePhraseShort(reminder.recurrence_rule);
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ This is a recurring reminder (${phrase}). Delete all future fires?`, [
				[
					{ text: "Yes, delete", callback_data: `delete_confirm:${id}` },
					{ text: "Cancel", callback_data: `delete_cancel:${id}` },
				],
			]);
			return;
		}

		const deleted = await deleteReminder(env.DB, id, String(chatId));
		if (deleted) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `🗑 Deleted reminder #${id}`);
		} else {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Reminder #${id} not found.`);
		}
	} catch (err) {
		console.error("handleDelete: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}
