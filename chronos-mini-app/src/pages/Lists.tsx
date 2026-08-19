import { useEffect, useState } from "react";
import { api } from "../api";
import { ListSummary, ListWithItems } from "../types";
import { Modal } from "../components/Modal";

export function Lists() {
	const [lists, setLists] = useState<ListSummary[] | null>(null);
	const [itemsByList, setItemsByList] = useState<Record<number, ListWithItems>>({});
	const [showCreate, setShowCreate] = useState(false);
	const [newName, setNewName] = useState("");
	const [addItemsFor, setAddItemsFor] = useState<number | null>(null);
	const [itemsText, setItemsText] = useState("");

	async function loadLists() {
		const data = await api.get<ListSummary[]>("/lists");
		setLists(data);
		const entries = await Promise.all(data.map((l) => api.get<ListWithItems>(`/lists/${l.id}`)));
		const map: Record<number, ListWithItems> = {};
		entries.forEach((e) => (map[e.list.id] = e));
		setItemsByList(map);
	}

	useEffect(() => {
		loadLists();
	}, []);

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
					return (
						<div className="card" key={l.id}>
							<div className="card-header">
								<div className="card-title">📋 {l.name}</div>
								<span className="badge badge-t3">{l.pending} pending</span>
							</div>

							{entry?.items.map((item) => (
								<div className="check-row" key={item.id}>
									<input
										type="checkbox"
										checked={item.completed === 1}
										disabled={item.completed === 1}
										onChange={() => handleToggleItem(item.id)}
									/>
									<label>{item.item}</label>
								</div>
							))}

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
		</>
	);
}
