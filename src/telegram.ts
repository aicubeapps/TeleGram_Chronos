const TELEGRAM_API = "https://api.telegram.org/bot";
const TELEGRAM_FILE_API = "https://api.telegram.org/file/bot";

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
	replyMarkup?: InlineKeyboardButton[][],
): Promise<void> {
	try {
		const body: Record<string, unknown> = { chat_id: chatId, message_id: messageId, text };
		if (replyMarkup) body.reply_markup = { inline_keyboard: replyMarkup };

		const res = await fetch(`${TELEGRAM_API}${token}/editMessageText`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			console.error("Telegram editMessageText failed:", res.status, await res.text());
		}
	} catch (err) {
		console.error("Telegram editMessageText error:", err);
	}
}

export async function getFile(token: string, fileId: string): Promise<string | null> {
	try {
		const res = await fetch(`${TELEGRAM_API}${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
		if (!res.ok) {
			console.error("Telegram getFile failed:", res.status, await res.text());
			return null;
		}
		const data = (await res.json()) as { ok: boolean; result?: { file_path?: string } };
		return data.result?.file_path ?? null;
	} catch (err) {
		console.error("Telegram getFile error:", err);
		return null;
	}
}

export async function downloadFile(token: string, filePath: string): Promise<ArrayBuffer | null> {
	try {
		const res = await fetch(`${TELEGRAM_FILE_API}${token}/${filePath}`);
		if (!res.ok) {
			console.error("Telegram file download failed:", res.status, await res.text());
			return null;
		}
		return await res.arrayBuffer();
	} catch (err) {
		console.error("Telegram file download error:", err);
		return null;
	}
}

export async function sendDocument(
	token: string,
	chatId: number | string,
	fileData: ArrayBuffer,
	filename: string,
	caption?: string,
): Promise<boolean> {
	try {
		const form = new FormData();
		form.append("chat_id", String(chatId));
		if (caption) form.append("caption", caption);
		form.append("document", new Blob([fileData]), filename);

		const res = await fetch(`${TELEGRAM_API}${token}/sendDocument`, { method: "POST", body: form });
		if (!res.ok) {
			console.error("Telegram sendDocument failed:", res.status, await res.text());
			return false;
		}
		return true;
	} catch (err) {
		console.error("Telegram sendDocument error:", err);
		return false;
	}
}

export async function sendPhoto(
	token: string,
	chatId: number | string,
	fileData: ArrayBuffer,
	caption?: string,
): Promise<boolean> {
	try {
		const form = new FormData();
		form.append("chat_id", String(chatId));
		if (caption) form.append("caption", caption);
		form.append("photo", new Blob([fileData]), "photo.jpg");

		const res = await fetch(`${TELEGRAM_API}${token}/sendPhoto`, { method: "POST", body: form });
		if (!res.ok) {
			console.error("Telegram sendPhoto failed:", res.status, await res.text());
			return false;
		}
		return true;
	} catch (err) {
		console.error("Telegram sendPhoto error:", err);
		return false;
	}
}
