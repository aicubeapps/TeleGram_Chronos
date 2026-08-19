import { authenticateRequest } from "./auth";
import {
	insertReminder,
	insertRecurring,
	insertListReminder,
	listPending,
	deleteReminder,
	getReminder,
	markSnoozed,
	markComplete,
	updateNextFire,
	getRemindersByLinkedItem,
	searchReminders,
} from "../db/reminders";
import { insertNote, listActiveNotes, deleteNoteRow } from "../db/notes";
import {
	getActiveListByName,
	getListById,
	getListItemById,
	insertList,
	insertListItems,
	getListItems,
	markItemComplete,
	reopenListItem,
	listActiveListsWithCounts,
} from "../db/lists";
import { insertDocument, getDocument, listRecentDocuments, getVaultStats } from "../db/documents";
import { deleteDocumentById } from "../commands/documents";
import { insertBookmark, getBookmark, listRecentBookmarks, deleteBookmarkRow, searchBookmarks } from "../db/bookmarks";
import { searchNotes } from "../db/notes";
import { searchDocuments } from "../db/documents";
import {
	getTodayAndOverdueReminders,
	getUpcomingReminders,
	getRecurringActiveCount,
	getActiveListsSummary,
	getListRemindersDueToday,
	getNotesSummary,
	getDocumentsSummary,
	getBookmarksSummary,
} from "../db/dashboard";
import { splitOverdueAndToday } from "../commands/dashboard";
import { editReminder } from "./reminders";
import { parseReminderDateTime, parseTimeHHMM, toD1Utc } from "../utils/datetime";
import { firstFireAfter } from "../utils/recurrence";

export const CORS_ORIGIN = "https://chronos-mini-app.pages.dev";

export function corsHeaders(): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": CORS_ORIGIN,
		"Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Authorization, Content-Type",
	};
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", ...corsHeaders() },
	});
}

function errorResponse(message: string, status: number): Response {
	return json({ error: message }, status);
}

function resolveContentType(fileType: string, mimeType: string | undefined, fileName: string): string {
	if (fileType === "photo") return "image/jpeg";
	if (mimeType) return mimeType;
	if (fileName.toLowerCase().endsWith(".pdf")) return "application/pdf";
	return "application/octet-stream";
}

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

export async function handleAPI(request: Request, env: Env): Promise<Response> {
	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders() });
	}

	const url = new URL(request.url);
	const segments = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);

	const auth = await authenticateRequest(request, env);
	if (!auth) {
		return errorResponse("Unauthorized", 401);
	}
	const chatId = auth.chatId;
	const method = request.method;

	try {
		// /reminders
		if (segments[0] === "reminders" && segments.length === 1 && method === "GET") {
			const linkedItemId = url.searchParams.get("linked_item_id");
			if (linkedItemId) {
				const itemId = parseInt(linkedItemId, 10);
				return json(await getRemindersByLinkedItem(env.DB, chatId, itemId));
			}
			return json(await listPending(env.DB, chatId));
		}
		if (segments[0] === "reminders" && segments.length === 1 && method === "POST") {
			const body = (await request.json()) as {
				date?: string;
				time?: string;
				message: string;
				recurring?: boolean;
				remind_on?: string;
				linked_list_id?: number;
				linked_item_id?: number | null;
			};
			if (!body.message) return errorResponse("message required", 400);

			// Item/list reminder format (remind_on as ISO string + linked ids)
			if (body.remind_on && body.linked_list_id != null) {
				const remindOn = toD1Utc(new Date(body.remind_on));
				const id = await insertListReminder(env.DB, chatId, body.message, remindOn, body.linked_list_id, body.linked_item_id ?? null);
				return json({ id }, 201);
			}

			if (!body.date || !body.time) return errorResponse("date, time, message required", 400);

			if (body.recurring) {
				const time = parseTimeHHMM(body.time);
				if (!time) return errorResponse("Invalid time", 400);
				const nextFire = firstFireAfter("DAILY", time.hour, time.minute);
				const id = await insertRecurring(env.DB, chatId, body.message, "DAILY", nextFire);
				return json({ id }, 201);
			}

			const remindOn = parseReminderDateTime(body.date, body.time);
			if (!remindOn) return errorResponse("Invalid date/time", 400);
			const id = await insertReminder(env.DB, chatId, body.message, remindOn);
			return json({ id }, 201);
		}
		if (segments[0] === "reminders" && segments.length === 2 && method === "DELETE") {
			const id = parseInt(segments[1], 10);
			const deleted = await deleteReminder(env.DB, id, chatId);
			return deleted ? json({ ok: true }) : errorResponse("Not found", 404);
		}
		if (segments[0] === "reminders" && segments.length === 2 && method === "PATCH") {
			const id = parseInt(segments[1], 10);
			const body = (await request.json()) as { message?: string; remind_on?: string; recurrence_rule?: string };
			const result = await editReminder(env, id, chatId, body);
			return json(result.body, result.status);
		}
		if (segments[0] === "reminders" && segments.length === 3 && segments[2] === "snooze" && method === "PATCH") {
			const id = parseInt(segments[1], 10);
			const body = (await request.json()) as { minutes: number };
			const reminder = await getReminder(env.DB, id);
			if (!reminder || reminder.chat_id !== chatId) return errorResponse("Not found", 404);

			const snoozeTarget = toD1Utc(new Date(Date.now() + body.minutes * 60_000));
			if (reminder.recurrence_rule) {
				await updateNextFire(env.DB, id, snoozeTarget);
			} else {
				await markSnoozed(env.DB, id, snoozeTarget);
			}
			return json({ ok: true });
		}
		if (segments[0] === "reminders" && segments.length === 3 && segments[2] === "complete" && method === "PATCH") {
			const id = parseInt(segments[1], 10);
			const reminder = await getReminder(env.DB, id);
			if (!reminder || reminder.chat_id !== chatId) return errorResponse("Not found", 404);
			await markComplete(env.DB, id);
			return json({ ok: true });
		}

		// /notes
		if (segments[0] === "notes" && segments.length === 1 && method === "GET") {
			return json(await listActiveNotes(env.DB, chatId));
		}
		if (segments[0] === "notes" && segments.length === 1 && method === "POST") {
			const body = (await request.json()) as { text: string; ttlDays?: number | null; expires_at?: string | null };
			if (!body.text) return errorResponse("text required", 400);
			let expiresAt: string | null = null;
			if (body.expires_at) {
				expiresAt = toD1Utc(new Date(body.expires_at));
			} else if (body.ttlDays) {
				expiresAt = toD1Utc(new Date(Date.now() + body.ttlDays * 24 * 60 * 60 * 1000));
			}
			const id = await insertNote(env.DB, chatId, body.text, expiresAt);
			return json({ id }, 201);
		}
		if (segments[0] === "notes" && segments.length === 2 && method === "DELETE") {
			const id = parseInt(segments[1], 10);
			const deleted = await deleteNoteRow(env.DB, id, chatId);
			return deleted ? json({ ok: true }) : errorResponse("Not found", 404);
		}

		// /lists
		if (segments[0] === "lists" && segments.length === 1 && method === "GET") {
			return json(await listActiveListsWithCounts(env.DB, chatId));
		}
		if (segments[0] === "lists" && segments.length === 1 && method === "POST") {
			const body = (await request.json()) as { name: string };
			if (!body.name?.trim()) return errorResponse("name required", 400);
			const existing = await getActiveListByName(env.DB, chatId, body.name.trim());
			if (existing) return errorResponse("List already exists", 409);
			const id = await insertList(env.DB, chatId, body.name.trim());
			return json({ id }, 201);
		}
		if (segments[0] === "lists" && segments.length === 2 && method === "GET") {
			const id = parseInt(segments[1], 10);
			const list = await getListById(env.DB, id);
			if (!list || list.chat_id !== chatId) return errorResponse("Not found", 404);
			const items = await getListItems(env.DB, id);
			return json({ list, items });
		}
		if (segments[0] === "lists" && segments.length === 3 && segments[2] === "items" && method === "POST") {
			const id = parseInt(segments[1], 10);
			const list = await getListById(env.DB, id);
			if (!list || list.chat_id !== chatId) return errorResponse("Not found", 404);
			const body = (await request.json()) as { items: string[] };
			const items = (body.items ?? []).map((s) => s.trim()).filter(Boolean);
			if (items.length === 0) return errorResponse("items required", 400);
			await insertListItems(env.DB, id, items);
			return json({ ok: true }, 201);
		}

		// /list-items/:id/done
		if (segments[0] === "list-items" && segments.length === 3 && segments[2] === "done" && method === "PATCH") {
			const itemId = parseInt(segments[1], 10);
			const item = await getListItemById(env.DB, itemId);
			if (!item) return errorResponse("Not found", 404);
			const list = await getListById(env.DB, item.list_id);
			if (!list || list.chat_id !== chatId) return errorResponse("Not found", 404);
			await markItemComplete(env.DB, itemId);
			return json({ ok: true });
		}

		// /list-items/:id/reopen
		if (segments[0] === "list-items" && segments.length === 3 && segments[2] === "reopen" && method === "PATCH") {
			const itemId = parseInt(segments[1], 10);
			const item = await getListItemById(env.DB, itemId);
			if (!item) return errorResponse("Not found", 404);
			const list = await getListById(env.DB, item.list_id);
			if (!list || list.chat_id !== chatId) return errorResponse("Not found", 404);
			await reopenListItem(env.DB, itemId);
			return json({ ok: true });
		}

		// /vault/stats
		if (segments[0] === "vault" && segments.length === 2 && segments[1] === "stats" && method === "GET") {
			const rows = await getVaultStats(env.DB, chatId);
			const FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024;
			let totalBytes = 0;
			const byType: Record<string, { bytes: number; count: number }> = {
				document: { bytes: 0, count: 0 },
				photo: { bytes: 0, count: 0 },
				unknown: { bytes: 0, count: 0 },
			};
			for (const row of rows) {
				const key = row.file_type === "photo" ? "photo" : row.file_type === "document" ? "document" : "unknown";
				byType[key].bytes += Number(row.total_bytes) || 0;
				byType[key].count += Number(row.count) || 0;
				totalBytes += Number(row.total_bytes) || 0;
			}
			return json({ total_bytes: totalBytes, free_tier_bytes: FREE_TIER_BYTES, by_type: byType });
		}

		// /documents
		if (segments[0] === "documents" && segments.length === 1 && method === "GET") {
			return json(await listRecentDocuments(env.DB, chatId));
		}
		if (segments[0] === "documents" && segments.length === 2 && segments[1] === "upload" && method === "POST") {
			const formData = await request.formData();
			const file = formData.get("file");
			const label = formData.get("label");
			if (!(file instanceof File) || typeof label !== "string" || !label.trim()) {
				return errorResponse("file and label required", 400);
			}

			const fileType = file.type.startsWith("image/") ? "photo" : "document";
			const contentType = resolveContentType(fileType, file.type, file.name);
			const safeName = file.name.replace(/\//g, "_");
			const r2Key = `${chatId}/${Date.now()}_${safeName}`;
			const fileSize = file.size ?? 0;

			await env.BUCKET.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType } });
			const id = await insertDocument(env.DB, chatId, r2Key, label.trim(), fileType, fileSize);
			return json({ id, label: label.trim(), file_type: fileType }, 201);
		}
		if (segments[0] === "documents" && segments.length === 2 && method === "DELETE") {
			const id = parseInt(segments[1], 10);
			const label = await deleteDocumentById(env, id, chatId);
			return label ? json({ ok: true }) : errorResponse("Not found", 404);
		}
		if (segments[0] === "documents" && segments.length === 2 && method === "GET") {
			const id = parseInt(segments[1], 10);
			const doc = await getDocument(env.DB, id);
			if (!doc || doc.chat_id !== chatId) return errorResponse("Not found", 404);
			const object = await env.BUCKET.get(doc.r2_key);
			if (!object) return errorResponse("File not found", 404);
			return new Response(object.body, {
				status: 200,
				headers: {
					"Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
					"Content-Disposition": `attachment; filename="${doc.label.replace(/"/g, "")}"`,
					"Cache-Control": "private, max-age=60",
					...corsHeaders(),
				},
			});
		}

		// /bookmarks
		if (segments[0] === "bookmarks" && segments.length === 1 && method === "GET") {
			return json(await listRecentBookmarks(env.DB, chatId));
		}
		if (segments[0] === "bookmarks" && segments.length === 1 && method === "POST") {
			const body = (await request.json()) as { url: string; label?: string };
			if (!body.url || !/^https?:\/\//i.test(body.url)) return errorResponse("Valid url required", 400);
			const domain = extractDomain(body.url);
			const label = body.label?.trim() || domain;
			const id = await insertBookmark(env.DB, chatId, body.url, label);
			return json({ id, label }, 201);
		}
		if (segments[0] === "bookmarks" && segments.length === 2 && method === "DELETE") {
			const id = parseInt(segments[1], 10);
			const deleted = await deleteBookmarkRow(env.DB, id, chatId);
			return deleted ? json({ ok: true }) : errorResponse("Not found", 404);
		}

		// /search
		if (segments[0] === "search" && segments.length === 1 && method === "GET") {
			const q = url.searchParams.get("q") ?? "";
			const keywords = q
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.map((k) => k.toLowerCase());
			if (keywords.length === 0) return json({ reminders: [], notes: [], documents: [], bookmarks: [] });

			const [reminders, notes, documents, bookmarks] = await Promise.all([
				searchReminders(env.DB, chatId, keywords),
				searchNotes(env.DB, chatId, keywords),
				searchDocuments(env.DB, chatId, keywords),
				searchBookmarks(env.DB, chatId, keywords),
			]);
			return json({ reminders, notes, documents, bookmarks });
		}

		// /summary
		if (segments[0] === "summary" && segments.length === 1 && method === "GET") {
			const [todayAndOverdue, upcoming, recurringCount, lists, listReminders, notes, documents, bookmarks] = await Promise.all([
				getTodayAndOverdueReminders(env.DB, chatId),
				getUpcomingReminders(env.DB, chatId),
				getRecurringActiveCount(env.DB, chatId),
				getActiveListsSummary(env.DB, chatId),
				getListRemindersDueToday(env.DB, chatId),
				getNotesSummary(env.DB, chatId),
				getDocumentsSummary(env.DB, chatId),
				getBookmarksSummary(env.DB, chatId),
			]);
			const { overdue, today } = splitOverdueAndToday(todayAndOverdue);
			return json({ overdue, today, upcoming, recurringCount, lists, listReminders, notes, documents, bookmarks });
		}

		if (segments[0] === "bookmarks" && segments.length === 2 && method === "GET") {
			const id = parseInt(segments[1], 10);
			const bookmark = await getBookmark(env.DB, id);
			if (!bookmark || bookmark.chat_id !== chatId) return errorResponse("Not found", 404);
			return json(bookmark);
		}

		return errorResponse("Not found", 404);
	} catch (err) {
		console.error("handleAPI: failed:", err);
		return errorResponse("Internal error", 500);
	}
}
