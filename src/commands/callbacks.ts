import { markSnoozed, markComplete, getReminder, updateNextFire, deleteReminder } from "../db/reminders";
import { answerCallbackQuery, editMessageText } from "../telegram";
import { toD1Utc } from "../utils/datetime";
import { SNOOZE_OPTIONS } from "../cron/dispatch";
import { TelegramCallbackQuery } from "../types";

const SNOOZE_LABELS: Record<number, string> = Object.fromEntries(SNOOZE_OPTIONS.map((o) => [o.minutes, o.label]));

function parseIdSuffix(data: string, prefix: string): number | null {
	const id = parseInt(data.slice(prefix.length), 10);
	return Number.isNaN(id) ? null : id;
}

export async function handleCallbackQuery(env: Env, callbackQuery: TelegramCallbackQuery): Promise<void> {
	const data = callbackQuery.data ?? "";
	const chatId = callbackQuery.message?.chat.id;
	const messageId = callbackQuery.message?.message_id;

	if (chatId === undefined || messageId === undefined) {
		await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id);
		return;
	}

	const original = callbackQuery.message?.text ?? "Reminder";

	try {
		if (data.startsWith("snooze:")) {
			const [, idStr, minutesStr] = data.split(":");
			const id = parseInt(idStr, 10);
			const minutes = parseInt(minutesStr, 10);

			if (Number.isNaN(id) || Number.isNaN(minutes)) {
				await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Invalid action");
				return;
			}

			const reminder = await getReminder(env.DB, id);
			if (!reminder) {
				await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Reminder not found");
				return;
			}

			const snoozeTarget = toD1Utc(new Date(Date.now() + minutes * 60_000));
			if (reminder.recurrence_rule) {
				// Recurring reminders are scheduled off next_fire, not snoozed_until/sent,
				// so "snooze" here just pushes next_fire out.
				await updateNextFire(env.DB, id, snoozeTarget);
			} else {
				await markSnoozed(env.DB, id, snoozeTarget);
			}

			const label = SNOOZE_LABELS[minutes] ?? `${minutes}m`;
			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, `Snoozed for ${label}`);
			await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `${original}\n\n⏰ Snoozed for ${label}`);
		} else if (data.startsWith("complete:")) {
			const id = parseIdSuffix(data, "complete:");
			if (id === null) {
				await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Invalid action");
				return;
			}

			await markComplete(env.DB, id);
			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Marked complete");
			await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `${original}\n\n✅ Completed`);
		} else if (data.startsWith("done_once:")) {
			const id = parseIdSuffix(data, "done_once:");
			if (id === null) {
				await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Invalid action");
				return;
			}

			// next_fire was already advanced by the cron dispatcher when this message
			// was sent — this tap is just an acknowledgment, no further DB write needed.
			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Done for this time");
			await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `${original}\n\n✅ Done this time`);
		} else if (data.startsWith("stop_recurring:")) {
			const id = parseIdSuffix(data, "stop_recurring:");
			if (id === null) {
				await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Invalid action");
				return;
			}

			await markComplete(env.DB, id);
			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Recurring reminder stopped");
			await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `${original}\n\n🚫 Stopped recurring`);
		} else if (data.startsWith("delete_confirm:")) {
			const id = parseIdSuffix(data, "delete_confirm:");
			if (id === null) {
				await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Invalid action");
				return;
			}

			const deleted = await deleteReminder(env.DB, id, String(chatId));
			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, deleted ? "Deleted" : "Not found");
			await editMessageText(
				env.TELEGRAM_BOT_TOKEN,
				chatId,
				messageId,
				deleted ? `🗑 Deleted reminder #${id}` : `Reminder #${id} not found.`,
			);
		} else if (data.startsWith("delete_cancel:")) {
			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Cancelled");
			await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `${original}\n\nCancelled — reminder kept.`);
		} else {
			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id);
		}
	} catch (err) {
		console.error("handleCallbackQuery failed:", err);
		await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Something went wrong, try again");
	}
}
