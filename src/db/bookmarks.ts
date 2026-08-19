export interface BookmarkRow {
	id: number;
	chat_id: string;
	url: string;
	label: string;
	created_at: string;
}

export async function insertBookmark(db: D1Database, chatId: string, url: string, label: string): Promise<number> {
	const result = await db.prepare(`INSERT INTO bookmarks (chat_id, url, label) VALUES (?, ?, ?)`).bind(chatId, url, label).run();
	return result.meta.last_row_id as number;
}

export async function getBookmark(db: D1Database, id: number): Promise<BookmarkRow | null> {
	const row = await db.prepare(`SELECT * FROM bookmarks WHERE id = ?`).bind(id).first<BookmarkRow>();
	return row ?? null;
}

export async function listRecentBookmarks(db: D1Database, chatId: string): Promise<BookmarkRow[]> {
	const { results } = await db
		.prepare(`SELECT * FROM bookmarks WHERE chat_id = ? ORDER BY created_at DESC LIMIT 20`)
		.bind(chatId)
		.all<BookmarkRow>();
	return results ?? [];
}

export async function deleteBookmarkRow(db: D1Database, id: number, chatId: string): Promise<boolean> {
	const result = await db.prepare(`DELETE FROM bookmarks WHERE id = ? AND chat_id = ?`).bind(id, chatId).run();
	return (result.meta.changes ?? 0) > 0;
}

export async function searchBookmarks(db: D1Database, chatId: string, keywords: string[]): Promise<BookmarkRow[]> {
	const conditions = keywords.map(() => `(label LIKE ? OR url LIKE ?)`).join(" AND ");
	const binds = keywords.flatMap((k) => [`%${k}%`, `%${k}%`]);
	const { results } = await db
		.prepare(`SELECT * FROM bookmarks WHERE chat_id = ? AND ${conditions} ORDER BY created_at DESC LIMIT 10`)
		.bind(chatId, ...binds)
		.all<BookmarkRow>();
	return results ?? [];
}
