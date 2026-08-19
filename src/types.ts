export interface TelegramChat {
	id: number;
}

export interface TelegramPhotoSize {
	file_id: string;
	file_unique_id: string;
	width: number;
	height: number;
	file_size?: number;
}

export interface TelegramDocument {
	file_id: string;
	file_unique_id: string;
	file_name?: string;
	mime_type?: string;
	file_size?: number;
}

export interface TelegramMessage {
	message_id: number;
	chat: TelegramChat;
	text?: string;
	caption?: string;
	document?: TelegramDocument;
	photo?: TelegramPhotoSize[];
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
