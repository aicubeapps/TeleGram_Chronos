import { useEffect, useRef, useState } from "react";
import { api, API_BASE } from "../api";
import { DocumentRow, VaultStats } from "../types";
import { Modal } from "../components/Modal";
import { getWebApp } from "../telegram";

function badgeClass(fileType: string): string {
	return fileType === "photo" ? "badge-nse" : "badge-t1";
}

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const FREE_TIER = 10 * 1024 ** 3;

export function Vault() {
	const [docs, setDocs] = useState<DocumentRow[] | null>(null);
	const [stats, setStats] = useState<VaultStats | null>(null);
	const [label, setLabel] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
	const [retrieving, setRetrieving] = useState<number | null>(null);
	const [retrieveError, setRetrieveError] = useState<number | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	function load() {
		api.get<DocumentRow[]>("/documents").then(setDocs);
		api.get<VaultStats>("/vault/stats").then(setStats).catch(() => setStats(null));
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

	// BUG-08: fixed retrieve with loading, error, open vs download
	async function handleRetrieve(doc: DocumentRow) {
		setRetrieving(doc.id);
		setRetrieveError(null);
		try {
			const initData = getWebApp()?.initData ?? "";
			const res = await fetch(`${API_BASE}/api/documents/${doc.id}`, {
				headers: { Authorization: initData },
			});
			if (!res.ok) throw new Error("Fetch failed");

			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;

			if (doc.file_type === "photo") {
				a.target = "_blank";
				a.rel = "noopener";
			} else {
				a.download = doc.label;
			}

			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			setTimeout(() => URL.revokeObjectURL(url), 5000);
		} catch {
			setRetrieveError(doc.id);
		} finally {
			setRetrieving(null);
		}
	}

	async function handleDelete() {
		if (!deleteTarget) return;
		await api.del(`/documents/${deleteTarget.id}`);
		setDeleteTarget(null);
		load();
	}

	const pct = stats ? (stats.total_bytes / FREE_TIER) * 100 : 0;
	const colorClass = pct < 70 ? "ok" : pct < 90 ? "warning" : "danger";

	return (
		<>
			<div className="page-title">Vault</div>

			{/* BUG-07: storage usage widget */}
			{stats && (
				<div className="card mb-md">
					<div className="card-header">
						<span className="card-title">STORAGE</span>
						<span className="text-muted">{formatBytes(stats.total_bytes)} of 10 GB used</span>
					</div>
					<div className="progress-bar-wrap">
						<div className="progress-bar-bg">
							<div className={`progress-bar-fill ${colorClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
						</div>
					</div>
					<div className="settings-row">
						<span className="settings-label">📄 Documents</span>
						<span className="settings-value">
							{formatBytes(stats.by_type.document.bytes)} ({stats.by_type.document.count} files)
						</span>
					</div>
					<div className="settings-row">
						<span className="settings-label">🖼️ Photos</span>
						<span className="settings-value">
							{formatBytes(stats.by_type.photo.bytes)} ({stats.by_type.photo.count} files)
						</span>
					</div>
					{stats.by_type.unknown.count > 0 && (
						<div className="settings-row">
							<span className="settings-label">❓ Unknown</span>
							<span className="settings-value">
								{formatBytes(stats.by_type.unknown.bytes)} ({stats.by_type.unknown.count} files)
							</span>
						</div>
					)}
				</div>
			)}

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
						{retrieveError === d.id && (
							<div className="banner banner-error mb-md">❌ Failed to retrieve file. Try again.</div>
						)}
						<div style={{ display: "flex", gap: 8 }}>
							<button className="btn btn-sm btn-outline" onClick={() => handleRetrieve(d)} disabled={retrieving === d.id}>
								{retrieving === d.id ? <span className="spinner" /> : "⬇️ Retrieve"}
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
