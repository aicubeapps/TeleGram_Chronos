export interface TelegramChat {
	id: number;
}

export interface TelegramMessage {
	message_id: number;
	chat: TelegramChat;
	text?: string;
}

export interface TelegramCallbackQuery {
	id: string;
	data?: string;
	message?: TelegramMessage;
}

export interface TelegramUpdate {
	update_id: number;
	message?: TelegramMessage;
	callback_query?: TelegramCallbackQuery;
}
