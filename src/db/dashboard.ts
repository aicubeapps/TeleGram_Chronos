import { ReminderRow } from "./reminders";

export interface ListPendingSummary {
	name: string;
	total: number;
	pending: number;
}

export interface ListReminderDueRow extends ReminderRow {
	list_name: string;
}

export interface NotesSummary {
	total: number;
	expiring_soon: number;
}

export interface CountSummary {
	total: number;
	last_saved: string | null;
}

export async function getTodayAndOverdueReminders(db: D1Database, chatId: string): Promise<ReminderRow[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM reminders
			 WHERE chat_id = ?
			 AND completed = 0
			 AND linked_list_id IS NULL
			 AND (
				DATE(remind_on) = DATE('now')
				OR (remind_on < datetime('now') AND sent = 1 AND completed = 0)
			 )
			 ORDER BY remind_on ASC`,
		)
		.bind(chatId)
		.all<ReminderRow>();
	return results ?? [];
}

export async function getUpcomingReminders(db: D1Database, chatId: string): Promise<ReminderRow[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM reminders
			 WHERE chat_id = ?
			 AND completed = 0
			 AND linked_list_id IS NULL
			 AND DATE(remind_on) > DATE('now')
			 AND DATE(remind_on) <= DATE('now', '+7 days')
			 ORDER BY remind_on ASC
			 LIMIT 5`,
		)
		.bind(chatId)
		.all<ReminderRow>();
	return results ?? [];
}

export async function getRecurringActiveCount(db: D1Database, chatId: string): Promise<number> {
	const row = await db
		.prepare(`SELECT COUNT(*) as count FROM reminders WHERE chat_id = ? AND completed = 0 AND recurrence_rule IS NOT NULL`)
		.bind(chatId)
		.first<{ count: number }>();
	return row?.count ?? 0;
}

export async function getActiveListsSummary(db: D1Database, chatId: string): Promise<ListPendingSummary[]> {
	const { results } = await db
		.prepare(
			`SELECT l.name as name,
			 COUNT(li.id) as total,
			 SUM(CASE WHEN li.completed = 0 THEN 1 ELSE 0 END) as pending
			 FROM lists l
			 LEFT JOIN list_items li ON l.id = li.list_id
			 WHERE l.chat_id = ?
			 AND l.archived_at IS NULL
			 GROUP BY l.id
			 ORDER BY pending DESC`,
		)
		.bind(chatId)
		.all<ListPendingSummary>();
	return results ?? [];
}

export async function getListRemindersDueToday(db: D1Database, chatId: string): Promise<ListReminderDueRow[]> {
	const { results } = await db
		.prepare(
			`SELECT r.*, l.name as list_name FROM reminders r
			 JOIN lists l ON r.linked_list_id = l.id
			 WHERE r.chat_id = ?
			 AND r.completed = 0
			 AND DATE(r.remind_on) = DATE('now')`,
		)
		.bind(chatId)
		.all<ListReminderDueRow>();
	return results ?? [];
}

export async function getNotesSummary(db: D1Database, chatId: string): Promise<NotesSummary> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) as total,
			 SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= datetime('now', '+2 days') THEN 1 ELSE 0 END) as expiring_soon
			 FROM notes
			 WHERE chat_id = ?
			 AND (expires_at IS NULL OR expires_at > datetime('now'))`,
		)
		.bind(chatId)
		.first<NotesSummary>();
	return row ?? { total: 0, expiring_soon: 0 };
}

export async function getDocumentsSummary(db: D1Database, chatId: string): Promise<CountSummary> {
	const row = await db
		.prepare(`SELECT COUNT(*) as total, MAX(created_at) as last_saved FROM documents WHERE chat_id = ?`)
		.bind(chatId)
		.first<CountSummary>();
	return row ?? { total: 0, last_saved: null };
}

export async function getBookmarksSummary(db: D1Database, chatId: string): Promise<CountSummary> {
	const row = await db
		.prepare(`SELECT COUNT(*) as total, MAX(created_at) as last_saved FROM bookmarks WHERE chat_id = ?`)
		.bind(chatId)
		.first<CountSummary>();
	return row ?? { total: 0, last_saved: null };
}
