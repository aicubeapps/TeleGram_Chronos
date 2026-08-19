import { searchNotes } from "../db/notes";
import { searchDocuments } from "../db/documents";
import { searchBookmarks } from "../db/bookmarks";
import { daysRemaining, daysLabel } from "./notes";
import { displayFileType } from "./documents";
import { sendMessage } from "../telegram";

const SEARCH_USAGE = "Usage: /search <keywords>\nExample: /search mseb";
const GENERIC_ERROR = "Something went wrong, try again";

export async function handleUnifiedSearch(env: Env, chatId: number, text: string): Promise<void> {
	const rawKeywords = text.trim().split(/\s+/).slice(1);
	if (rawKeywords.length === 0) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, SEARCH_USAGE);
		return;
	}
	const keywords = rawKeywords.map((k) => k.toLowerCase());
	const query = rawKeywords.join(" ");

	try {
		const [notes, documents, bookmarks] = await Promise.all([
			searchNotes(env.DB, String(chatId), keywords),
			searchDocuments(env.DB, String(chatId), keywords),
			searchBookmarks(env.DB, String(chatId), keywords),
		]);

		const lines: string[] = [`🔍 Results for "${query}":`, "", `📝 Notes (${notes.length})`];
		if (notes.length === 0) {
			lines.push("No matches");
		} else {
			for (const n of notes) {
				const suffix = n.expires_at ? ` — expires in ${daysLabel(daysRemaining(n.expires_at))}` : "";
				lines.push(`- #${n.id} ${n.text}${suffix}`);
			}
		}

		lines.push("", `📎 Documents (${documents.length})`);
		if (documents.length === 0) {
			lines.push("No matches");
		} else {
			for (const d of documents) {
				lines.push(`- #${d.id} ${d.label} — ${displayFileType(d.file_type, d.r2_key)}`);
			}
		}

		lines.push("", `🔖 Bookmarks (${bookmarks.length})`);
		if (bookmarks.length === 0) {
			lines.push("No matches");
		} else {
			for (const b of bookmarks) {
				lines.push(`- #${b.id} ${b.label}`);
			}
		}

		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
	} catch (err) {
		console.error("handleUnifiedSearch: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}
