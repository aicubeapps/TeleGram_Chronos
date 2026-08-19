export interface NoteRow {
	id: number;
	chat_id: string;
	text: string;
	expires_at: string | null;
	created_at: string;
}

export async function insertNote(db: D1Database, chatId: string, text: string, expiresAt: string | null): Promise<number> {
	const result = await db
		.prepare(`INSERT INTO notes (chat_id, text, expires_at) VALUES (?, ?, ?)`)
		.bind(chatId, text, expiresAt)
		.run();
	return result.meta.last_row_id as number;
}

export async function searchNotes(db: D1Database, chatId: string, keywords: string[]): Promise<NoteRow[]> {
	const conditions = keywords.map(() => `text LIKE ?`).join(" AND ");
	const binds = keywords.map((k) => `%${k}%`);
	const { results } = await db
		.prepare(
			`SELECT * FROM notes
			 WHERE chat_id = ?
			 AND (expires_at IS NULL OR expires_at > datetime('now'))
			 AND ${conditions}
			 ORDER BY created_at DESC LIMIT 10`,
		)
		.bind(chatId, ...binds)
		.all<NoteRow>();
	return results ?? [];
}

export async function listActiveNotes(db: D1Database, chatId: string): Promise<NoteRow[]> {
	const { results } = await db
		.prepare(
			`SELECT * FROM notes
			 WHERE chat_id = ?
			 AND (expires_at IS NULL OR expires_at > datetime('now'))
			 ORDER BY created_at DESC`,
		)
		.bind(chatId)
		.all<NoteRow>();
	return results ?? [];
}

export async function deleteNoteRow(db: D1Database, id: number, chatId: string): Promise<boolean> {
	const result = await db.prepare(`DELETE FROM notes WHERE id = ? AND chat_id = ?`).bind(id, chatId).run();
	return (result.meta.changes ?? 0) > 0;
}

export async function deleteExpiredNotes(db: D1Database): Promise<number> {
	const result = await db.prepare(`DELETE FROM notes WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`).run();
	return result.meta.changes ?? 0;
}
