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
	notes: NoteRow[];
	documents: DocumentRow[];
	bookmarks: BookmarkRow[];
}
