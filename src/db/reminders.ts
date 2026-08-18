import { fromD1Utc, istTodayYMD, IST_OFFSET_MIN } from "../utils/datetime";

export interface ReminderRow {
	id: number;
	chat_id: string;
	message: string;
	remind_on: string;
	snoozed_until: string | null;
	sent: number;
	completed: number;
	recurrence_rule: string | null;
	next_fire: string | null;
	linked_list_id: number | null;
	linked_item_id: number | null;
	created_at: string;
}

export async function insertReminder(db: D1Database, chatId: string, message: string, remindOn: string): Promise<number> {
	const result = await db
		.prepare(`INSERT INTO reminders (chat_id, message, remind_on) VALUES (?, ?, ?)`)
		.bind(chatId, message, remindOn)
		.run();
	return result.meta.last_row_id as number;
}

// `remind_on` is NOT NULL in the schema; for recurring reminders it's set to the same
// value as `next_fire` (their initial scheduled fire) but plays no role in scheduling —
// getRecurringDue() and getDueReminders() key off recurrence_rule/next_fire instead.
export async function insertRecurring(
	db: D1Database,
	chatId: string,
	message: string,
	recurrenceRule: string,
	nextFire: string,
): Promise<number> {
	const result = await db
		.prepare(`INSERT INTO reminders (chat_id, message, remind_on, recurrence_rule, next_fire) VALUES (?, ?, ?, ?, ?)`)
		.bind(chatId, message, nextFire, recurrenceRule, nextFire)
		.run();
	return result.meta.last_row_id as number;
}

export async function getReminder(db: D1Database, id: number): Promise<ReminderRow | null> {
	const row = await db.prepare(`SELECT * FROM reminders WHERE id = ?`).bind(id).first<ReminderRow>();
	return row ?? null;
}

export interface GroupedReminders {
	overdue: ReminderRow[];
	today: ReminderRow[];
	upcoming: ReminderRow[];
	recurring: ReminderRow[];
}

export async function listPending(db: D1Database, chatId: string): Promise<GroupedReminders> {
	const { results } = await db
		.prepare(
			`SELECT * FROM reminders WHERE chat_id = ? AND completed = 0 AND recurrence_rule IS NULL ORDER BY COALESCE(snoozed_until, remind_on) ASC`,
		)
		.bind(chatId)
		.all<ReminderRow>();

	const { results: recurringResults } = await db
		.prepare(`SELECT * FROM reminders WHERE chat_id = ? AND completed = 0 AND recurrence_rule IS NOT NULL ORDER BY next_fire ASC`)
		.bind(chatId)
		.all<ReminderRow>();

	const grouped: GroupedReminders = { overdue: [], today: [], upcoming: [], recurring: recurringResults ?? [] };
	const nowMs = Date.now();
	const today = istTodayYMD();

	for (const row of results ?? []) {
		const effective = row.snoozed_until ?? row.remind_on;
		const effectiveMs = fromD1Utc(effective).getTime();

		if (effectiveMs <= nowMs) {
			grouped.overdue.push(row);
			continue;
		}

		const ist = new Date(effectiveMs + IST_OFFSET_MIN * 60 * 1000);
		if (ist.getUTCFullYear() === today.y && ist.getUTCMonth() === today.m && ist.getUTCDate() === today.d) {
			grouped.today.push(row);
		} else {
			grouped.upcoming.push(row);
		}
	}

	return grouped;
}

export async function deleteReminder(db: D1Database, id: number, chatId: string): Promise<boolean> {
	const result = await db.prepare(`DELETE FROM reminders WHERE id = ? AND chat_id = ?`).bind(id, chatId).run();
	return (result.meta.changes ?? 0) > 0;
}

export async function markSnoozed(db: D1Database, id: number, snoozedUntil: string): Promise<void> {
	await db.prepare(`UPDATE reminders SET snoozed_until = ?, sent = 0 WHERE id = ?`).bind(snoozedUntil, id).run();
}

export async function markComplete(db: D1Database, id: number): Promise<void> {
	await db.prepare(`UPDATE reminders SET completed = 1 WHERE id = ?`).bind(id).run();
}

export async function markSent(db: D1Database, id: number): Promise<void> {
	await db.prepare(`UPDATE reminders SET sent = 1 WHERE id = ?`).bind(id).run();
}

export async function updateNextFire(db: D1Database, id: number, nextFire: string): Promise<void> {
	await db.prepare(`UPDATE reminders SET next_fire = ? WHERE id = ?`).bind(nextFire, id).run();
}

export async function getDueReminders(db: D1Database): Promise<ReminderRow[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM reminders
			 WHERE completed = 0
			 AND recurrence_rule IS NULL
			 AND remind_on <= datetime('now')
			 AND (snoozed_until IS NULL OR snoozed_until <= datetime('now'))
			 AND sent = 0`,
		)
		.all<ReminderRow>();
	return results ?? [];
}

export async function getRecurringDue(db: D1Database): Promise<ReminderRow[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM reminders
			 WHERE recurrence_rule IS NOT NULL
			 AND next_fire <= datetime('now')
			 AND completed = 0`,
		)
		.all<ReminderRow>();
	return results ?? [];
}
