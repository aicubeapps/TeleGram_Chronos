import { insertReminder, listPending, deleteReminder } from "../db/reminders";
import { sendMessage } from "../telegram";
import { parseReminderDateTime, formatIST } from "../utils/datetime";

export const HELP_TEXT = [
	"Available commands:",
	"",
	"/remind <date> <HH:MM> <message> — set a reminder",
	"    date: +N (days from today), YYYY-MM-DD, or DD-MMM-YYYY",
	"    example: /remind +7 09:00 Submit MIS report",
	"    example: /remind 2026-09-15 10:00 Team review meeting",
	"",
	"/list — show your pending reminders, grouped by overdue/today/upcoming",
	"/delete <id> — delete a reminder, e.g. /delete 3",
	"/help — show this message",
].join("\n");

const REMIND_USAGE = "Usage: /remind <date> <HH:MM> <message>\nExample: /remind +7 09:00 Submit MIS report";
const DELETE_USAGE = "Usage: /delete <id>\nExample: /delete 3";
const GENERIC_ERROR = "Something went wrong, try again";

export async function handleStart(env: Env, chatId: number): Promise<void> {
	await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `👋 Welcome to Chronos!\n\n${HELP_TEXT}`);
}

export async function handleRemind(env: Env, chatId: number, text: string): Promise<void> {
	const parts = text.trim().split(/\s+/);
	if (parts.length < 4) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, REMIND_USAGE);
		return;
	}

	const [, dateStr, timeStr, ...messageParts] = parts;
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

		if (grouped.overdue.length === 0 && grouped.today.length === 0 && grouped.upcoming.length === 0) {
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
		const deleted = await deleteReminder(env.DB, id, String(chatId));
		if (deleted) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `🗑 Deleted reminder #${id}`);
		} else {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Reminder #${id} not found.`);
		}
	} catch (err) {
		console.error("handleDelete: deleteReminder failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}
