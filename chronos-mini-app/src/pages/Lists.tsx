import { useEffect, useState } from "react";
import { api } from "../api";
import { GroupedReminders, ListItemRow, ListRow, ListSummary, ListWithItems, ReminderRow } from "../types";
import { Modal } from "../components/Modal";
import { ShareModal } from "../components/ShareModal";

const IST_OFFSET_MS = 330 * 60 * 1000;

function formatISTDisplay(utcDatetime: string): string {
	const d = new Date(`${utcDatetime.replace(" ", "T")}Z`);
	const ist = new Date(d.getTime() + IST_OFFSET_MS);
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
}

interface Props {
	expandedListId?: number | null;
}

interface ItemReminderForm {
	date: string;
	time: string;
}

export function Lists({ expandedListId }: Props) {
	const [lists, setLists] = useState<ListSummary[] | null>(null);
	const [itemsByList, setItemsByList] = useState<Record<number, ListWithItems>>({});
	const [itemReminderMap, setItemReminderMap] = useState<Record<number, ReminderRow>>({});
	const [expandedListIds, setExpandedListIds] = useState<Set<number>>(new Set());
	const [showCreate, setShowCreate] = useState(false);
	const [newName, setNewName] = useState("");
	const [addItemsFor, setAddItemsFor] = useState<number | null>(null);
	const [itemsText, setItemsText] = useState("");

	// BUG-03: item reminder modal
	const [itemReminderModal, setItemReminderModal] = useState<{ item: ListItemRow; list: ListRow } | null>(null);
	const [itemReminderForm, setItemReminderForm] = useState<ItemReminderForm>({ date: "", time: "" });
	const [shareListId, setShareListId] = useState<number | null>(null);

	async function loadLists() {
		const [data, grouped] = await Promise.all([
			api.get<ListSummary[]>("/lists"),
			api.get<GroupedReminders>("/reminders"),
		]);
		setLists(data);

		// Build item reminder map from all pending reminders
		const allReminders = [...grouped.overdue, ...grouped.today, ...grouped.upcoming];
		const reminderMap: Record<number, ReminderRow> = {};
		allReminders.forEach((r) => {
			if (r.linked_item_id != null) reminderMap[r.linked_item_id] = r;
		});
		setItemReminderMap(reminderMap);

		const entries = await Promise.all(data.map((l) => api.get<ListWithItems>(`/lists/${l.id}`)));
		const map: Record<number, ListWithItems> = {};
		entries.forEach((e) => (map[e.list.id] = e));
		setItemsByList(map);
	}

	useEffect(() => {
		loadLists();
	}, []);

	// BUG-10: expand a specific list when navigated from Dashboard
	useEffect(() => {
		if (expandedListId != null) {
			setExpandedListIds((prev) => new Set([...prev, expandedListId]));
		}
	}, [expandedListId]);

	function toggleExpand(listId: number) {
		setExpandedListIds((prev) => {
			const next = new Set(prev);
			if (next.has(listId)) next.delete(listId);
			else next.add(listId);
			return next;
		});
	}

	async function handleCreate() {
		if (!newName.trim()) return;
		await api.post("/lists", { name: newName.trim() });
		setShowCreate(false);
		setNewName("");
		loadLists();
	}

	async function handleAddItems() {
		if (addItemsFor === null || !itemsText.trim()) return;
		const items = itemsText
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		await api.post(`/lists/${addItemsFor}/items`, { items });
		setAddItemsFor(null);
		setItemsText("");
		loadLists();
	}

	async function handleToggleItem(itemId: number) {
		await api.patch(`/list-items/${itemId}/done`);
		loadLists();
	}

	// BUG-04: reopen a completed item
	async function handleReopenItem(itemId: number) {
		await api.patch(`/list-items/${itemId}/reopen`);
		loadLists();
	}

	// BUG-03: open item reminder modal
	function openItemReminderModal(item: ListItemRow, list: ListRow) {
		const existing = itemReminderMap[item.id];
		if (existing) {
			const d = new Date(`${(existing.remind_on).replace(" ", "T")}Z`);
			const ist = new Date(d.getTime() + IST_OFFSET_MS);
			const dateStr = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
			const timeStr = `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
			setItemReminderForm({ date: dateStr, time: timeStr });
		} else {
			setItemReminderForm({ date: "", time: "" });
		}
		setItemReminderModal({ item, list });
	}

	async function handleSaveItemReminder() {
		if (!itemReminderModal) return;
		const { item, list } = itemReminderModal;
		const { date, time } = itemReminderForm;
		if (!date || !time) return;

		const [y, m, d] = date.split("-").map(Number);
		const [hh, mm] = time.split(":").map(Number);
		const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0) - IST_OFFSET_MS;
		const remind_on = new Date(utcMs).toISOString();

		await api.post("/reminders", {
			message: `${list.name} — ${item.item}`,
			remind_on,
			linked_list_id: list.id,
			linked_item_id: item.id,
		});
		setItemReminderModal(null);
		loadLists();
	}

	if (!lists) {
		return <div className="skeleton" style={{ height: 200 }} />;
	}

	return (
		<>
			<div className="page-title">Lists</div>

			<button className="btn btn-primary mb-md" onClick={() => setShowCreate(true)}>
				+ New List
			</button>

			{lists.length === 0 ? (
				<p className="text-muted">No active lists</p>
			) : (
				lists.map((l) => {
					const entry = itemsByList[l.id];
					const donePct = l.total > 0 ? Math.round(((l.total - l.pending) / l.total) * 100) : 0;
					const isExpanded = expandedListIds.has(l.id);
					const incompleteItems = entry?.items.filter((i) => i.completed === 0) ?? [];
					const completedItems = entry?.items.filter((i) => i.completed === 1) ?? [];

					return (
						<div className="card" key={l.id}>
							<div
								className="card-header card-hoverable"
								style={{ cursor: "pointer" }}
								onClick={() => toggleExpand(l.id)}
							>
								<div className="card-title">📋 {l.name}</div>
								<span className="badge badge-t3">{l.pending} pending</span>
								<button
									className="btn btn-sm btn-outline"
									style={{ marginLeft: "auto", marginRight: 4 }}
									onClick={(e) => { e.stopPropagation(); setShareListId(l.id); }}
								>
									📤
								</button>
								<span style={{ color: "var(--muted)", fontSize: 12 }}>
									{isExpanded ? "▲" : "▼"}
								</span>
							</div>

							{isExpanded && (
								<>
									{/* BUG-03: incomplete items with ⏰ button */}
									{incompleteItems.map((item) => (
										<div className="check-row" key={item.id} style={{ justifyContent: "space-between" }}>
											<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
												<input
													type="checkbox"
													checked={false}
													onChange={() => handleToggleItem(item.id)}
												/>
												<label>{item.item}</label>
											</div>
											<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
												{itemReminderMap[item.id] && (
													<span className="badge badge-t1">
														⏰ {formatISTDisplay(itemReminderMap[item.id].remind_on)}
													</span>
												)}
												<button
													className="icon-btn"
													onClick={() => openItemReminderModal(item, entry.list)}
													title="Set item reminder"
												>
													⏰
												</button>
											</div>
										</div>
									))}

									{/* BUG-04: completed items collapsible section */}
									{completedItems.length > 0 && (
										<details className="completed-section" style={{ marginTop: 8 }}>
											<summary
												className="settings-label"
												style={{ cursor: "pointer", userSelect: "none", padding: "4px 0" }}
											>
												COMPLETED ({completedItems.length})
											</summary>
											{completedItems.map((item) => (
												<div
													className="check-row"
													key={item.id}
													style={{ justifyContent: "space-between", marginTop: 4 }}
												>
													<span style={{ textDecoration: "line-through", color: "var(--muted)", fontSize: 12 }}>
														{item.item}
													</span>
													<button
														className="btn btn-sm btn-outline"
														onClick={() => handleReopenItem(item.id)}
													>
														↩ Reopen
													</button>
												</div>
											))}
										</details>
									)}
								</>
							)}

							<div className="progress-bar-wrap">
								<div className="progress-bar-bg">
									<div className={`progress-bar-fill ${l.pending === 0 ? "ok" : "warning"}`} style={{ width: `${donePct}%` }} />
								</div>
							</div>

							<button className="add-link mt-sm" onClick={() => setAddItemsFor(l.id)}>
								+ Add items
							</button>
						</div>
					);
				})
			)}

			{shareListId !== null && (
				<ShareModal objectType="list" objectId={shareListId} onClose={() => setShareListId(null)} />
			)}

			{showCreate && (
				<Modal title="New List" onClose={() => setShowCreate(false)}>
					<input className="input mb-md" placeholder="List name" value={newName} onChange={(e) => setNewName(e.target.value)} />
					<button className="btn btn-primary btn-block" onClick={handleCreate}>
						Create
					</button>
				</Modal>
			)}

			{addItemsFor !== null && (
				<Modal title="Add Items" onClose={() => setAddItemsFor(null)}>
					<textarea
						className="input mb-md"
						rows={3}
						placeholder="Milk, Eggs, Bread"
						value={itemsText}
						onChange={(e) => setItemsText(e.target.value)}
					/>
					<button className="btn btn-primary btn-block" onClick={handleAddItems}>
						Add
					</button>
				</Modal>
			)}

			{/* BUG-03: item reminder modal */}
			{itemReminderModal && (
				<Modal title="SET ITEM REMINDER" onClose={() => setItemReminderModal(null)}>
					<p className="text-muted mb-md" style={{ fontSize: 13 }}>{itemReminderModal.item.item}</p>

					<label className="input-label">DATE</label>
					<input
						className="input mb-md"
						type="date"
						value={itemReminderForm.date}
						onChange={(e) => setItemReminderForm({ ...itemReminderForm, date: e.target.value })}
					/>

					<label className="input-label">TIME (IST)</label>
					<input
						className="input mb-md"
						type="time"
						value={itemReminderForm.time}
						onChange={(e) => setItemReminderForm({ ...itemReminderForm, time: e.target.value })}
					/>

					<div style={{ display: "flex", gap: 8 }}>
						<button className="btn btn-outline btn-block" onClick={() => setItemReminderModal(null)}>
							Cancel
						</button>
						<button className="btn btn-primary btn-block" onClick={handleSaveItemReminder}>
							Set Reminder
						</button>
					</div>
				</Modal>
			)}
		</>
	);
}
