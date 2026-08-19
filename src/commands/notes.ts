import { insertNote, listActiveNotes, deleteNoteRow } from "../db/notes";
import { sendMessage } from "../telegram";
import { toD1Utc, fromD1Utc, MONTH_NAMES } from "../utils/datetime";

const NOTE_USAGE = "Please add note text. Example: /note Pay electricity bill";
const DELETE_NOTE_USAGE = "Usage: /delete note <id>\nExample: /delete note 5";
const GENERIC_ERROR = "Something went wrong, try again";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysRemaining(expiresAt: string): number {
	const ms = fromD1Utc(expiresAt).getTime() - Date.now();
	return Math.max(0, Math.ceil(ms / MS_PER_DAY));
}

export function daysLabel(n: number): string {
	return `${n} day${n === 1 ? "" : "s"}`;
}

function formatCreatedLabel(d1UtcValue: string): string {
	const d = fromD1Utc(d1UtcValue);
	return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

function parseNoteCommand(text: string): { expiresInDays: number | null; content: string } {
	const tokens = text.trim().split(/\s+/).slice(1);
	const expiryMatch = /^\+(\d+)d$/i.exec(tokens[0] ?? "");
	if (expiryMatch) {
		return { expiresInDays: parseInt(expiryMatch[1], 10), content: tokens.slice(1).join(" ").trim() };
	}
	return { expiresInDays: null, content: tokens.join(" ").trim() };
}

export async function handleNote(env: Env, chatId: number, text: string): Promise<void> {
	const { expiresInDays, content } = parseNoteCommand(text);

	if (!content) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, NOTE_USAGE);
		return;
	}

	try {
		const expiresAt = expiresInDays !== null ? toD1Utc(new Date(Date.now() + expiresInDays * MS_PER_DAY)) : null;
		await insertNote(env.DB, String(chatId), content, expiresAt);

		if (expiresInDays !== null) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `💣 Note saved (expires in ${daysLabel(expiresInDays)}): ${content}`);
		} else {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `📝 Note saved: ${content}`);
		}
	} catch (err) {
		console.error("handleNote: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleNotes(env: Env, chatId: number): Promise<void> {
	try {
		const notes = await listActiveNotes(env.DB, String(chatId));
		if (notes.length === 0) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "You have no active notes.");
			return;
		}

		const lines = [`📝 Your Notes (${notes.length}):`, ""];
		for (const n of notes) {
			if (n.expires_at) {
				lines.push(`#${n.id} ${n.text} 💣 expires in ${daysLabel(daysRemaining(n.expires_at))}`);
			} else {
				lines.push(`#${n.id} ${n.text} — ${formatCreatedLabel(n.created_at)}`);
			}
		}
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
	} catch (err) {
		console.error("handleNotes: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleDeleteNote(env: Env, chatId: number, text: string): Promise<void> {
	const parts = text.trim().split(/\s+/);
	if (parts.length !== 3 || !/^\d+$/.test(parts[2])) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, DELETE_NOTE_USAGE);
		return;
	}
	const id = parseInt(parts[2], 10);

	try {
		const deleted = await deleteNoteRow(env.DB, id, String(chatId));
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, deleted ? "🗑️ Note deleted" : `Note #${id} not found.`);
	} catch (err) {
		console.error("handleDeleteNote: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}
