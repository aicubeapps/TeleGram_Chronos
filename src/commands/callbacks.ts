import { markSnoozed, markComplete } from "../db/reminders";
import { answerCallbackQuery, editMessageText } from "../telegram";
import { toD1Utc } from "../utils/datetime";
import { SNOOZE_OPTIONS } from "../cron/dispatch";
import { TelegramCallbackQuery } from "../types";

const SNOOZE_LABELS: Record<number, string> = Object.fromEntries(SNOOZE_OPTIONS.map((o) => [o.minutes, o.label]));

export async function handleCallbackQuery(env: Env, callbackQuery: TelegramCallbackQuery): Promise<void> {
	const data = callbackQuery.data ?? "";
	const chatId = callbackQuery.message?.chat.id;
	const messageId = callbackQuery.message?.message_id;

	if (chatId === undefined || messageId === undefined) {
		await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id);
		return;
	}

	try {
		if (data.startsWith("snooze:")) {
			const [, idStr, minutesStr] = data.split(":");
			const id = parseInt(idStr, 10);
			const minutes = parseInt(minutesStr, 10);

			if (Number.isNaN(id) || Number.isNaN(minutes)) {
				await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Invalid action");
				return;
			}

			const snoozedUntil = toD1Utc(new Date(Date.now() + minutes * 60_000));
			await markSnoozed(env.DB, id, snoozedUntil);

			const label = SNOOZE_LABELS[minutes] ?? `${minutes}m`;
			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, `Snoozed for ${label}`);

			const original = callbackQuery.message?.text ?? "Reminder";
			await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `${original}\n\n⏰ Snoozed for ${label}`);
		} else if (data.startsWith("complete:")) {
			const [, idStr] = data.split(":");
			const id = parseInt(idStr, 10);

			if (Number.isNaN(id)) {
				await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Invalid action");
				return;
			}

			await markComplete(env.DB, id);
			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Marked complete");

			const original = callbackQuery.message?.text ?? "Reminder";
			await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `${original}\n\n✅ Completed`);
		} else {
			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id);
		}
	} catch (err) {
		console.error("handleCallbackQuery failed:", err);
		await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callbackQuery.id, "Something went wrong, try again");
	}
}
