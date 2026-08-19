export interface TelegramWebAppUser {
	id: number;
	first_name: string;
	last_name?: string;
	username?: string;
}

export interface TelegramWebApp {
	initData: string;
	initDataUnsafe: { user?: TelegramWebAppUser };
	ready: () => void;
	expand: () => void;
	close: () => void;
}

declare global {
	interface Window {
		Telegram?: { WebApp: TelegramWebApp };
	}
}

export function getWebApp(): TelegramWebApp | undefined {
	return window.Telegram?.WebApp;
}
