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

export interface GroupedReminders {
	overdue: ReminderRow[];
	today: ReminderRow[];
	upcoming: ReminderRow[];
	recurring: ReminderRow[];
}

export interface NoteRow {
	id: number;
	chat_id: string;
	text: string;
	expires_at: string | null;
	created_at: string;
}

export interface ListSummary {
	id: number;
	chat_id: string;
	name: string;
	archived_at: string | null;
	created_at: string;
	total: number;
	pending: number;
}

export interface ListItemRow {
	id: number;
	list_id: number;
	item: string;
	completed: number;
	created_at: string;
	completed_at: string | null;
}

export interface ListRow {
	id: number;
	chat_id: string;
	name: string;
	archived_at: string | null;
	created_at: string;
}

export interface ListWithItems {
	list: ListRow;
	items: ListItemRow[];
}

export interface DocumentRow {
	id: number;
	chat_id: string;
	r2_key: string;
	label: string;
	file_type: string;
	file_size: number;
	created_at: string;
}

export interface BookmarkRow {
	id: number;
	chat_id: string;
	url: string;
	label: string;
	created_at: string;
}

export interface SearchResults {
	reminders: ReminderRow[];
	notes: NoteRow[];
	documents: DocumentRow[];
	bookmarks: BookmarkRow[];
}

export interface ShareData {
	token: string;
	url: string;
	expires_at: string;
}

export interface VaultTypeStats {
	bytes: number;
	count: number;
}

export interface VaultStats {
	total_bytes: number;
	free_tier_bytes: number;
	by_type: {
		document: VaultTypeStats;
		photo: VaultTypeStats;
		unknown: VaultTypeStats;
	};
}
