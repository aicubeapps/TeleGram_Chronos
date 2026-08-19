import { useEffect, useRef, useState } from "react";
import { api, API_BASE } from "../api";
import { DocumentRow } from "../types";
import { Modal } from "../components/Modal";
import { getWebApp } from "../telegram";

function badgeClass(fileType: string): string {
	return fileType === "photo" ? "badge-nse" : "badge-t1";
}

export function Vault() {
	const [docs, setDocs] = useState<DocumentRow[] | null>(null);
	const [label, setLabel] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	function load() {
		api.get<DocumentRow[]>("/documents").then(setDocs);
	}

	useEffect(load, []);

	async function handleUpload() {
		if (!file || !label.trim()) return;
		setUploading(true);
		setProgress(0);

		const formData = new FormData();
		formData.append("file", file);
		formData.append("label", label.trim());

		try {
			await api.upload("/documents/upload", formData);
			setProgress(100);
			setFile(null);
			setLabel("");
			if (fileInputRef.current) fileInputRef.current.value = "";
			load();
		} finally {
			setUploading(false);
		}
	}

	async function handleRetrieve(doc: DocumentRow) {
		const initData = getWebApp()?.initData ?? "";
		const res = await fetch(`${API_BASE}/api/documents/${doc.id}`, { headers: { Authorization: initData } });
		if (!res.ok) return;
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = doc.label;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		await api.del(`/documents/${deleteTarget.id}`);
		setDeleteTarget(null);
		load();
	}

	return (
		<>
			<div className="page-title">Vault</div>

			<div className="card">
				<div className="card-header">
					<div className="card-title">Upload Document</div>
				</div>
				<input ref={fileInputRef} type="file" accept="*/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mb-sm" />
				<input className="input mb-sm" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
				{uploading && (
					<div className="progress-bar-wrap mb-sm">
						<div className="progress-bar-bg">
							<div className="progress-bar-fill ok" style={{ width: `${progress}%` }} />
						</div>
					</div>
				)}
				<button className="btn btn-primary" onClick={handleUpload} disabled={!file || !label.trim() || uploading}>
					{uploading ? "Uploading..." : "Upload"}
				</button>
			</div>

			{!docs ? (
				<div className="skeleton" style={{ height: 120 }} />
			) : docs.length === 0 ? (
				<p className="text-muted">Vault empty</p>
			) : (
				docs.map((d) => (
					<div className="card" key={d.id}>
						<div className="card-header">
							<div className="card-title">{d.label}</div>
							<span className={`badge ${badgeClass(d.file_type)}`}>{d.file_type}</span>
						</div>
						<div style={{ display: "flex", gap: 8 }}>
							<button className="btn btn-sm btn-outline" onClick={() => handleRetrieve(d)}>
								Retrieve
							</button>
							<button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(d)}>
								Delete
							</button>
						</div>
					</div>
				))
			)}

			{deleteTarget && (
				<Modal title="Delete Document" onClose={() => setDeleteTarget(null)}>
					<p>
						Delete <strong>{deleteTarget.label}</strong>?
					</p>
					<button className="btn btn-danger btn-block mt-md" onClick={handleDelete}>
						Yes, delete
					</button>
				</Modal>
			)}
		</>
	);
}
