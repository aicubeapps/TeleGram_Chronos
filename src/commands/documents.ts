import { insertDocument, getDocument, listRecentDocuments, deleteDocumentRow, DocumentRow } from "../db/documents";
import { sendMessage, getFile, downloadFile, sendDocument, sendPhoto } from "../telegram";
import { fromD1Utc, IST_OFFSET_MIN, MONTH_NAMES, pad } from "../utils/datetime";
import { TelegramMessage } from "../types";

const NO_CAPTION_MSG = "Please add a caption as the label. Example: MSEB Bill March 2026";
const RECALL_USAGE = "Usage: /recall <id>\nExample: /recall 12";
const DELETE_DOC_USAGE = "Usage: /delete doc <id>\nExample: /delete doc 12";
const GENERIC_ERROR = "Something went wrong, try again";
const MAX_FILE_SIZE = 20_000_000;

interface FileInfo {
	fileId: string;
	fileType: "photo" | "document";
	mimeType?: string;
	fileName?: string;
	fileSize?: number;
}

function extractFileInfo(message: TelegramMessage): FileInfo | null {
	if (message.document) {
		return {
			fileId: message.document.file_id,
			fileType: "document",
			mimeType: message.document.mime_type,
			fileName: message.document.file_name,
			fileSize: message.document.file_size,
		};
	}
	if (message.photo && message.photo.length > 0) {
		const largest = message.photo[message.photo.length - 1];
		return { fileId: largest.file_id, fileType: "photo", fileSize: largest.file_size };
	}
	return null;
}

function resolveContentType(fileType: "photo" | "document", mimeType?: string, fileName?: string): string {
	if (fileType === "photo") return "image/jpeg";
	if (mimeType) return mimeType;
	if (fileName?.toLowerCase().endsWith(".pdf")) return "application/pdf";
	return "application/octet-stream";
}

function buildR2Key(chatId: number, originalName: string): string {
	const safeName = originalName.replace(/\//g, "_");
	return `${chatId}/${Date.now()}_${safeName}`;
}

export function displayFileType(fileType: string, r2Key: string): string {
	const match = /\.([a-zA-Z0-9]+)$/.exec(r2Key);
	return match ? match[1].toUpperCase() : fileType.toUpperCase();
}

function formatDateLabel(d1UtcValue: string): string {
	const utcMs = fromD1Utc(d1UtcValue).getTime();
	const ist = new Date(utcMs + IST_OFFSET_MIN * 60 * 1000);
	return `${pad(ist.getUTCDate())} ${MONTH_NAMES[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

export async function saveDocument(env: Env, message: TelegramMessage): Promise<void> {
	const chatId = message.chat.id;
	const caption = (message.caption ?? "").trim();

	if (!caption) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, NO_CAPTION_MSG);
		return;
	}

	const info = extractFileInfo(message);
	if (!info) return;

	if (info.fileSize && info.fileSize > MAX_FILE_SIZE) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ File too large (max 20MB)");
		return;
	}

	try {
		const filePath = await getFile(env.TELEGRAM_BOT_TOKEN, info.fileId);
		if (!filePath) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
			return;
		}

		const fileData = await downloadFile(env.TELEGRAM_BOT_TOKEN, filePath);
		if (!fileData) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
			return;
		}

		const originalName = info.fileName ?? (info.fileType === "photo" ? "photo.jpg" : info.fileId);
		const r2Key = buildR2Key(chatId, originalName);
		const contentType = resolveContentType(info.fileType, info.mimeType, originalName);

		await env.BUCKET.put(r2Key, fileData, { httpMetadata: { contentType } });

		const label = caption.toLowerCase();
		await insertDocument(env.DB, String(chatId), r2Key, label, info.fileType);

		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Saved: ${caption}`);
	} catch (err) {
		console.error("saveDocument: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

async function replyWithDocumentList(env: Env, chatId: number, docs: DocumentRow[], emptyMessage: string): Promise<void> {
	if (docs.length === 0) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, emptyMessage);
		return;
	}

	const lines = docs.map(
		(d) => `📎 #${d.id} ${d.label} — ${displayFileType(d.file_type, d.r2_key)} — ${formatDateLabel(d.created_at)}`,
	);
	lines.push("", "Tap /recall <id> to retrieve a document.");
	await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
}

export async function handleFiles(env: Env, chatId: number): Promise<void> {
	try {
		const docs = await listRecentDocuments(env.DB, String(chatId));
		await replyWithDocumentList(env, chatId, docs, "You have no saved documents.");
	} catch (err) {
		console.error("handleFiles: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleRecall(env: Env, chatId: number, text: string): Promise<void> {
	const parts = text.trim().split(/\s+/);
	if (parts.length !== 2 || !/^\d+$/.test(parts[1])) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, RECALL_USAGE);
		return;
	}
	const id = parseInt(parts[1], 10);

	try {
		const doc = await getDocument(env.DB, id);
		if (!doc || doc.chat_id !== String(chatId)) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Document #${id} not found.`);
			return;
		}

		const object = await env.BUCKET.get(doc.r2_key);
		if (!object) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
			return;
		}

		const fileData = await object.arrayBuffer();
		const filename = doc.r2_key.split("/").pop() ?? doc.r2_key;

		const sent =
			doc.file_type === "photo"
				? await sendPhoto(env.TELEGRAM_BOT_TOKEN, chatId, fileData, doc.label)
				: await sendDocument(env.TELEGRAM_BOT_TOKEN, chatId, fileData, filename, doc.label);

		if (!sent) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
		}
	} catch (err) {
		console.error("handleRecall: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleDeleteDocument(env: Env, chatId: number, text: string): Promise<void> {
	const parts = text.trim().split(/\s+/);
	if (parts.length !== 3 || !/^\d+$/.test(parts[2])) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, DELETE_DOC_USAGE);
		return;
	}
	const id = parseInt(parts[2], 10);

	try {
		const doc = await getDocument(env.DB, id);
		if (!doc || doc.chat_id !== String(chatId)) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Document #${id} not found.`);
			return;
		}

		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Delete ${doc.label}?`, [
			[
				{ text: "Yes", callback_data: `delete_doc_confirm:${id}` },
				{ text: "Cancel", callback_data: `delete_doc_cancel:${id}` },
			],
		]);
	} catch (err) {
		console.error("handleDeleteDocument: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function deleteDocumentById(env: Env, id: number, chatId: string): Promise<string | null> {
	const doc = await getDocument(env.DB, id);
	if (!doc || doc.chat_id !== chatId) return null;
	await env.BUCKET.delete(doc.r2_key);
	await deleteDocumentRow(env.DB, id, chatId);
	return doc.label;
}
