export interface ListRow {
	id: number;
	chat_id: string;
	name: string;
	archived_at: string | null;
	created_at: string;
}

export interface ListItemRow {
	id: number;
	list_id: number;
	item: string;
	completed: number;
	created_at: string;
	completed_at: string | null;
}

export interface ListSummary extends ListRow {
	total: number;
	pending: number;
}

export async function getActiveListByName(db: D1Database, chatId: string, name: string): Promise<ListRow | null> {
	const row = await db
		.prepare(`SELECT * FROM lists WHERE chat_id = ? AND LOWER(name) = LOWER(?) AND archived_at IS NULL`)
		.bind(chatId, name)
		.first<ListRow>();
	return row ?? null;
}

export async function getListByName(db: D1Database, chatId: string, name: string): Promise<ListRow | null> {
	const row = await db.prepare(`SELECT * FROM lists WHERE chat_id = ? AND LOWER(name) = LOWER(?)`).bind(chatId, name).first<ListRow>();
	return row ?? null;
}

export async function getListById(db: D1Database, id: number): Promise<ListRow | null> {
	const row = await db.prepare(`SELECT * FROM lists WHERE id = ?`).bind(id).first<ListRow>();
	return row ?? null;
}

export async function getActiveLists(db: D1Database, chatId: string): Promise<ListRow[]> {
	const { results } = await db
		.prepare(`SELECT * FROM lists WHERE chat_id = ? AND archived_at IS NULL`)
		.bind(chatId)
		.all<ListRow>();
	return results ?? [];
}

export async function insertList(db: D1Database, chatId: string, name: string): Promise<number> {
	const result = await db.prepare(`INSERT INTO lists (chat_id, name) VALUES (?, ?)`).bind(chatId, name).run();
	return result.meta.last_row_id as number;
}

export async function insertListItems(db: D1Database, listId: number, items: string[]): Promise<void> {
	const stmts = items.map((item) => db.prepare(`INSERT INTO list_items (list_id, item) VALUES (?, ?)`).bind(listId, item));
	await db.batch(stmts);
}

export async function getListItems(db: D1Database, listId: number): Promise<ListItemRow[]> {
	const { results } = await db
		.prepare(`SELECT * FROM list_items WHERE list_id = ? ORDER BY id ASC`)
		.bind(listId)
		.all<ListItemRow>();
	return results ?? [];
}

export async function getListItemById(db: D1Database, itemId: number): Promise<ListItemRow | null> {
	const row = await db.prepare(`SELECT * FROM list_items WHERE id = ?`).bind(itemId).first<ListItemRow>();
	return row ?? null;
}

export async function markItemComplete(db: D1Database, itemId: number): Promise<void> {
	await db.prepare(`UPDATE list_items SET completed = 1, completed_at = datetime('now') WHERE id = ?`).bind(itemId).run();
}

export async function listActiveListsWithCounts(db: D1Database, chatId: string): Promise<ListSummary[]> {
	const { results } = await db
		.prepare(
			`SELECT lists.*, COUNT(list_items.id) as total,
			 SUM(CASE WHEN list_items.completed = 0 THEN 1 ELSE 0 END) as pending
			 FROM lists LEFT JOIN list_items ON lists.id = list_items.list_id
			 WHERE lists.chat_id = ? AND lists.archived_at IS NULL
			 GROUP BY lists.id
			 ORDER BY lists.created_at DESC`,
		)
		.bind(chatId)
		.all<ListSummary>();
	return results ?? [];
}

export async function archiveListRow(db: D1Database, id: number): Promise<void> {
	await db.prepare(`UPDATE lists SET archived_at = datetime('now') WHERE id = ?`).bind(id).run();
}

export async function deleteListCascade(db: D1Database, listId: number): Promise<void> {
	await db.batch([
		db.prepare(`DELETE FROM list_items WHERE list_id = ?`).bind(listId),
		db.prepare(`DELETE FROM lists WHERE id = ?`).bind(listId),
		db.prepare(`DELETE FROM reminders WHERE linked_list_id = ?`).bind(listId),
	]);
}
