import { insertBookmark, getBookmark, listRecentBookmarks, deleteBookmarkRow } from "../db/bookmarks";
import { sendMessage } from "../telegram";
import { fromD1Utc, MONTH_NAMES, pad } from "../utils/datetime";

const BOOKMARK_USAGE = "Usage: /bookmark <url> <label>\nExample: /bookmark https://tradingview.com/chart ICT Chart Setup";
const RECALL_BOOKMARK_USAGE = "Usage: /recall bookmark <id>\nExample: /recall bookmark 3";
const DELETE_BOOKMARK_USAGE = "Usage: /delete bookmark <id>\nExample: /delete bookmark 3";
const GENERIC_ERROR = "Something went wrong, try again";

const URL_PATTERN = /https?:\/\/\S+/;

export function containsUrl(text: string): boolean {
	return URL_PATTERN.test(text);
}

function extractUrlAndLabel(text: string): { url: string; label: string } | null {
	const match = URL_PATTERN.exec(text);
	if (!match) return null;
	const url = match[0];
	const label = text.slice(match.index + url.length).trim();
	return { url, label };
}

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

function formatDateLabel(d1UtcValue: string): string {
	const d = fromD1Utc(d1UtcValue);
	return `${pad(d.getUTCDate())} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

export async function saveBookmark(env: Env, chatId: number, url: string, label: string): Promise<void> {
	if (!/^https?:\/\//i.test(url)) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, BOOKMARK_USAGE);
		return;
	}

	const domain = extractDomain(url);
	const finalLabel = label.trim() || domain;

	try {
		await insertBookmark(env.DB, String(chatId), url, finalLabel);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `🔖 Bookmark saved: ${finalLabel}\n🔗 ${domain}`);
	} catch (err) {
		console.error("saveBookmark: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleBookmark(env: Env, chatId: number, text: string): Promise<void> {
	const parsed = extractUrlAndLabel(text);
	if (!parsed) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, BOOKMARK_USAGE);
		return;
	}
	await saveBookmark(env, chatId, parsed.url, parsed.label);
}

export async function handleBookmarks(env: Env, chatId: number): Promise<void> {
	try {
		const bookmarks = await listRecentBookmarks(env.DB, String(chatId));
		if (bookmarks.length === 0) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "You have no saved bookmarks.");
			return;
		}

		const lines = [`🔖 Your Bookmarks (${bookmarks.length}):`, ""];
		for (const b of bookmarks) {
			lines.push(`#${b.id} ${b.label} — ${extractDomain(b.url)} — ${formatDateLabel(b.created_at)}`);
		}
		lines.push("", "Type /recall bookmark {id} to open", "Type /delete bookmark {id} to remove");
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
	} catch (err) {
		console.error("handleBookmarks: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleRecallBookmark(env: Env, chatId: number, text: string): Promise<void> {
	const parts = text.trim().split(/\s+/);
	if (parts.length !== 3 || !/^\d+$/.test(parts[2])) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, RECALL_BOOKMARK_USAGE);
		return;
	}
	const id = parseInt(parts[2], 10);

	try {
		const bookmark = await getBookmark(env.DB, id);
		if (!bookmark || bookmark.chat_id !== String(chatId)) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Bookmark #${id} not found.`);
			return;
		}
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `🔖 ${bookmark.label}\n🔗 ${bookmark.url}`);
	} catch (err) {
		console.error("handleRecallBookmark: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleDeleteBookmark(env: Env, chatId: number, text: string): Promise<void> {
	const parts = text.trim().split(/\s+/);
	if (parts.length !== 3 || !/^\d+$/.test(parts[2])) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, DELETE_BOOKMARK_USAGE);
		return;
	}
	const id = parseInt(parts[2], 10);

	try {
		const deleted = await deleteBookmarkRow(env.DB, id, String(chatId));
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, deleted ? "🗑️ Bookmark deleted" : `Bookmark #${id} not found.`);
	} catch (err) {
		console.error("handleDeleteBookmark: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}
