import { useState } from "react";
import { api } from "../api";
import { Modal } from "./Modal";
import { ShareData } from "../types";

interface Props {
	objectType: "note" | "list" | "document" | "bookmark";
	objectId: number;
	onClose: () => void;
}

const PAGES_BASE = "https://chronos-core-bot.aicube-apps.workers.dev";

const IST_OFFSET_MS = 330 * 60 * 1000;

function formatISTDisplay(utcStr: string): string {
	const d = new Date(utcStr.replace(" ", "T") + (utcStr.includes("T") ? "" : "Z"));
	const ist = new Date(d.getTime() + IST_OFFSET_MS);
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")} IST`;
}

export function ShareModal({ objectType, objectId, onClose }: Props) {
	const [loading, setLoading] = useState(false);
	const [share, setShare] = useState<ShareData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [expireDays, setExpireDays] = useState(7);
	const [copied, setCopied] = useState(false);
	const [revoking, setRevoking] = useState(false);

	async function handleCreate() {
		setLoading(true);
		setError(null);
		try {
			const data = await api.post<ShareData>("/share", {
				object_type: objectType,
				object_id: objectId,
				expires_in_days: expireDays,
			});
			setShare(data);
		} catch {
			setError("Failed to create share link. Try again.");
		} finally {
			setLoading(false);
		}
	}

	async function handleRevoke() {
		if (!share) return;
		setRevoking(true);
		try {
			const token = share.url.replace(`${PAGES_BASE}/share/`, "");
			await api.del(`/share/${token}`);
			setShare(null);
		} catch {
			setError("Failed to revoke link.");
		} finally {
			setRevoking(false);
		}
	}

	async function copyToClipboard() {
		if (!share) return;
		try {
			await navigator.clipboard.writeText(share.url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// fallback
		}
	}

	return (
		<Modal title="Share" onClose={onClose}>
			{!share ? (
				<>
					<div className="input-label">EXPIRES IN (DAYS)</div>
					<select
						className="select-sm mb-md"
						value={expireDays}
						onChange={(e) => setExpireDays(Number(e.target.value))}
						style={{ width: "100%" }}
					>
						<option value={1}>1 day</option>
						<option value={3}>3 days</option>
						<option value={7}>7 days</option>
						<option value={14}>14 days</option>
						<option value={30}>30 days</option>
					</select>
					{error && <div className="banner banner-error mb-md">{error}</div>}
					<button className="btn btn-primary btn-block" onClick={handleCreate} disabled={loading}>
						{loading ? <span className="spinner" /> : "📤 Generate Share Link"}
					</button>
				</>
			) : (
				<>
					<div className="input-label">SHARE LINK</div>
					<div
						style={{
							background: "var(--surface)",
							border: "1px solid var(--border)",
							borderRadius: "var(--radius-sm)",
							padding: "var(--sp-sm)",
							fontSize: 12,
							wordBreak: "break-all",
							marginBottom: "var(--sp-sm)",
						}}
					>
						{share.url}
					</div>
					<p className="text-muted" style={{ fontSize: 11, marginBottom: "var(--sp-md)" }}>
						Expires {formatISTDisplay(share.expires_at)}
					</p>
					{error && <div className="banner banner-error mb-md">{error}</div>}
					<div style={{ display: "flex", gap: 8 }}>
						<button className="btn btn-primary" style={{ flex: 1 }} onClick={copyToClipboard}>
							{copied ? "✅ Copied!" : "📋 Copy Link"}
						</button>
						<button className="btn btn-danger" style={{ flex: 1 }} onClick={handleRevoke} disabled={revoking}>
							{revoking ? <span className="spinner" /> : "🗑️ Revoke"}
						</button>
					</div>
				</>
			)}
		</Modal>
	);
}
