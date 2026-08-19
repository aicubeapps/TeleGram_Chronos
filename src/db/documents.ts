export interface DocumentRow {
	id: number;
	chat_id: string;
	r2_key: string;
	label: string;
	file_type: string;
	file_size: number;
	created_at: string;
}

export interface VaultStatsRow {
	file_type: string;
	total_bytes: number;
	count: number;
}

export async function insertDocument(
	db: D1Database,
	chatId: string,
	r2Key: string,
	label: string,
	fileType: string,
	fileSize = 0,
): Promise<number> {
	const result = await db
		.prepare(`INSERT INTO documents (chat_id, r2_key, label, file_type, file_size) VALUES (?, ?, ?, ?, ?)`)
		.bind(chatId, r2Key, label, fileType, fileSize)
		.run();
	return result.meta.last_row_id as number;
}

export async function getDocument(db: D1Database, id: number): Promise<DocumentRow | null> {
	const row = await db.prepare(`SELECT * FROM documents WHERE id = ?`).bind(id).first<DocumentRow>();
	return row ?? null;
}

export async function searchDocuments(db: D1Database, chatId: string, keywords: string[]): Promise<DocumentRow[]> {
	const conditions = keywords.map(() => `label LIKE ?`).join(" AND ");
	const binds = keywords.map((k) => `%${k}%`);
	const { results } = await db
		.prepare(`SELECT * FROM documents WHERE chat_id = ? AND ${conditions} ORDER BY created_at DESC LIMIT 10`)
		.bind(chatId, ...binds)
		.all<DocumentRow>();
	return results ?? [];
}

export async function listRecentDocuments(db: D1Database, chatId: string): Promise<DocumentRow[]> {
	const { results } = await db
		.prepare(`SELECT * FROM documents WHERE chat_id = ? ORDER BY created_at DESC LIMIT 10`)
		.bind(chatId)
		.all<DocumentRow>();
	return results ?? [];
}

export async function getVaultStats(db: D1Database, chatId: string): Promise<VaultStatsRow[]> {
	const { results } = await db
		.prepare(
			`SELECT file_type, COALESCE(SUM(file_size), 0) as total_bytes, COUNT(*) as count
			 FROM documents WHERE chat_id = ? GROUP BY file_type`,
		)
		.bind(chatId)
		.all<VaultStatsRow>();
	return results ?? [];
}

export async function deleteDocumentRow(db: D1Database, id: number, chatId: string): Promise<boolean> {
	const result = await db.prepare(`DELETE FROM documents WHERE id = ? AND chat_id = ?`).bind(id, chatId).run();
	return (result.meta.changes ?? 0) > 0;
}
