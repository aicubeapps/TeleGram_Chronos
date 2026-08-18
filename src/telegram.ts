const TELEGRAM_API = "https://api.telegram.org/bot";

export interface InlineKeyboardButton {
	text: string;
	callback_data: string;
}

export async function sendMessage(
	token: string,
	chatId: number | string,
	text: string,
	replyMarkup?: InlineKeyboardButton[][],
): Promise<boolean> {
	try {
		const body: Record<string, unknown> = { chat_id: chatId, text };
		if (replyMarkup) body.reply_markup = { inline_keyboard: replyMarkup };

		const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			console.error("Telegram sendMessage failed:", res.status, await res.text());
			return false;
		}
		return true;
	} catch (err) {
		console.error("Telegram sendMessage error:", err);
		return false;
	}
}

export async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string): Promise<void> {
	try {
		const res = await fetch(`${TELEGRAM_API}${token}/answerCallbackQuery`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
		});
		if (!res.ok) {
			console.error("Telegram answerCallbackQuery failed:", res.status, await res.text());
		}
	} catch (err) {
		console.error("Telegram answerCallbackQuery error:", err);
	}
}

export async function editMessageText(
	token: string,
	chatId: number | string,
	messageId: number,
	text: string,
): Promise<void> {
	try {
		const res = await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
		});
		if (!res.ok) {
			console.error("Telegram editMessageText failed:", res.status, await res.text());
		}
	} catch (err) {
		console.error("Telegram editMessageText error:", err);
	}
}
