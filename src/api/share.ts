import { authenticateRequest } from "./auth";

const PAGES_BASE = "https://chronos-mini-app.pages.dev";
const IST_OFFSET_MS = 330 * 60 * 1000;

function formatISTDisplay(utcStr: string): string {
	const d = new Date(utcStr.replace(" ", "T") + (utcStr.includes("T") ? "" : "Z"));
	const ist = new Date(d.getTime() + IST_OFFSET_MS);
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")} IST`;
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function html(body: string, status = 200): Response {
	return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function errorJson(msg: string, status: number): Response {
	return json({ error: msg }, status);
}

interface ShareTokenRow {
	id: number;
	token: string;
	object_type: string;
	object_id: number;
	chat_id: string;
	expires_at: string;
}

// ── POST /api/share ────────────────────────────────────────────────────────
export async function handleCreateShare(request: Request, env: Env): Promise<Response> {
	const auth = await authenticateRequest(request, env);
	if (!auth) return errorJson("Unauthorized", 401);
	const { chatId } = auth;

	const body = await request.json<{ object_type: string; object_id: number; expires_in_days?: number }>();
	const { object_type, object_id, expires_in_days = 7 } = body;

	if (!["note", "list", "document", "bookmark"].includes(object_type)) {
		return errorJson("Invalid object_type", 400);
	}

	// Verify ownership
	const tableMap: Record<string, string> = {
		note: "notes",
		list: "lists",
		document: "documents",
		bookmark: "bookmarks",
	};
	const owned = await env.DB.prepare(
		`SELECT id FROM ${tableMap[object_type]} WHERE id = ? AND chat_id = ?`
	).bind(object_id, chatId).first();
	if (!owned) return errorJson("Not found or access denied", 403);

	// Return existing non-expired token if present
	const existing = await env.DB.prepare(
		`SELECT token, expires_at FROM share_tokens WHERE object_type = ? AND object_id = ? AND chat_id = ? AND expires_at > datetime('now')`
	).bind(object_type, object_id, chatId).first<{ token: string; expires_at: string }>();
	if (existing) {
		return json({
			token: existing.token,
			url: `${PAGES_BASE}/share/${existing.token}`,
			expires_at: existing.expires_at,
		});
	}

	// Generate new token
	const token = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString();
	await env.DB.prepare(
		`INSERT INTO share_tokens (token, object_type, object_id, chat_id, expires_at) VALUES (?, ?, ?, ?, ?)`
	).bind(token, object_type, object_id, chatId, expiresAt).run();

	return json({ token, url: `${PAGES_BASE}/share/${token}`, expires_at: expiresAt }, 201);
}

// ── DELETE /api/share/:token ───────────────────────────────────────────────
export async function handleRevokeShare(request: Request, env: Env, token: string): Promise<Response> {
	const auth = await authenticateRequest(request, env);
	if (!auth) return errorJson("Unauthorized", 401);
	const { chatId } = auth;

	const row = await env.DB.prepare(
		`SELECT id FROM share_tokens WHERE token = ? AND chat_id = ?`
	).bind(token, chatId).first();
	if (!row) return errorJson("Not found", 404);

	await env.DB.prepare(`DELETE FROM share_tokens WHERE token = ?`).bind(token).run();
	return json({ success: true });
}

// ── GET /api/share/:token ──────────────────────────────────────────────────
export async function handleGetShare(env: Env, token: string): Promise<Response> {
	const row = await env.DB.prepare(
		`SELECT * FROM share_tokens WHERE token = ? AND expires_at > datetime('now')`
	).first<ShareTokenRow>();
	if (!row) return errorJson("Expired or invalid", 410);

	let data: unknown;

	if (row.object_type === "note") {
		const note = await env.DB.prepare(
			`SELECT id, text, expires_at, created_at FROM notes WHERE id = ?`
		).first<{ id: number; text: string; expires_at: string | null; created_at: string }>();
		if (!note) return errorJson("Not found", 404);
		if (note.expires_at && new Date(note.expires_at + "Z") < new Date()) return errorJson("Note has self-destructed", 410);
		data = note;

	} else if (row.object_type === "list") {
		const list = await env.DB.prepare(
			`SELECT id, name FROM lists WHERE id = ? AND archived_at IS NULL`
		).first<{ id: number; name: string }>();
		if (!list) return errorJson("Not found", 404);
		const items = await env.DB.prepare(
			`SELECT id, item, completed FROM list_items WHERE list_id = ? ORDER BY id ASC`
		).all<{ id: number; item: string; completed: number }>();
		data = { ...list, items: items.results };

	} else if (row.object_type === "document") {
		const doc = await env.DB.prepare(
			`SELECT id, label, file_type FROM documents WHERE id = ?`
		).first<{ id: number; label: string; file_type: string }>();
		if (!doc) return errorJson("Not found", 404);
		data = { ...doc, download_url: `/share/${token}/download` };

	} else if (row.object_type === "bookmark") {
		const bm = await env.DB.prepare(
			`SELECT id, url, label FROM bookmarks WHERE id = ?`
		).first<{ id: number; url: string; label: string }>();
		if (!bm) return errorJson("Not found", 404);
		data = bm;
	}

	return json({ object_type: row.object_type, expires_at: row.expires_at, data });
}

// ── GET /api/share/:token/download ────────────────────────────────────────
export async function handleShareDownload(env: Env, token: string): Promise<Response> {
	const row = await env.DB.prepare(
		`SELECT object_type, object_id FROM share_tokens WHERE token = ? AND expires_at > datetime('now')`
	).first<{ object_type: string; object_id: number }>();
	if (!row || row.object_type !== "document") return new Response("Not found", { status: 404 });

	const doc = await env.DB.prepare(
		`SELECT r2_key, label FROM documents WHERE id = ?`
	).first<{ r2_key: string; label: string }>();
	if (!doc) return new Response("Not found", { status: 404 });

	const object = await env.BUCKET.get(doc.r2_key);
	if (!object) return new Response("File not found", { status: 404 });

	const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";
	return new Response(object.body, {
		headers: {
			"Content-Type": contentType,
			"Content-Disposition": `attachment; filename="${encodeURIComponent(doc.label)}"`,
			"Cache-Control": "private, max-age=300",
		},
	});
}

// ── GET /share/:token (public HTML page) ──────────────────────────────────
export async function handleSharePage(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const parts = url.pathname.split("/").filter(Boolean); // ['share', token] or ['share', token, 'download']
	const token = parts[1];
	if (!token) return html(expiredPage(), 404);

	if (parts[2] === "download") return handleShareDownload(env, token);

	const row = await env.DB.prepare(
		`SELECT * FROM share_tokens WHERE token = ? AND expires_at > datetime('now')`
	).first<ShareTokenRow>();
	if (!row) return html(expiredPage(), 410);

	let pageHtml: string;

	if (row.object_type === "note") {
		const note = await env.DB.prepare(
			`SELECT text, expires_at FROM notes WHERE id = ?`
		).first<{ text: string; expires_at: string | null }>();
		if (!note || (note.expires_at && new Date(note.expires_at + "Z") < new Date())) return html(expiredPage(), 410);
		pageHtml = renderNote(note.text, row.expires_at, token);

	} else if (row.object_type === "list") {
		const list = await env.DB.prepare(`SELECT name FROM lists WHERE id = ?`).first<{ name: string }>();
		const items = await env.DB.prepare(
			`SELECT item, completed FROM list_items WHERE list_id = ? ORDER BY id ASC`
		).all<{ item: string; completed: number }>();
		if (!list) return html(expiredPage(), 410);
		pageHtml = renderList(list.name, items.results, row.expires_at, token);

	} else if (row.object_type === "document") {
		const doc = await env.DB.prepare(`SELECT label, file_type FROM documents WHERE id = ?`)
			.first<{ label: string; file_type: string }>();
		if (!doc) return html(expiredPage(), 410);
		pageHtml = renderDocument(doc.label, doc.file_type, token, row.expires_at);

	} else if (row.object_type === "bookmark") {
		const bm = await env.DB.prepare(`SELECT url, label FROM bookmarks WHERE id = ?`)
			.first<{ url: string; label: string }>();
		if (!bm) return html(expiredPage(), 410);
		pageHtml = renderBookmark(bm.url, bm.label, row.expires_at, token);

	} else {
		return html(expiredPage(), 404);
	}

	return html(pageHtml);
}

// ── HTML rendering helpers ─────────────────────────────────────────────────

function pageShell(type: string, content: string, expiresAt: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chronos — Shared ${type}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf8f5;color:#1a1714;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px}
    .header{background:#1e2327;color:#38bdf8;padding:12px 24px;border-radius:8px;font-size:12px;letter-spacing:2px;font-weight:700;margin-bottom:24px;width:100%;max-width:480px;display:flex;justify-content:space-between;align-items:center}
    .card{background:#fff;border:1px solid #e2ddd6;border-radius:12px;padding:20px;width:100%;max-width:480px;margin-bottom:16px}
    .label{font-size:10px;letter-spacing:1.5px;color:#6b6050;font-weight:700;margin-bottom:8px;text-transform:uppercase}
    .content{font-size:15px;line-height:1.7;white-space:pre-wrap;word-break:break-word}
    .check-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0ece6;font-size:14px}
    .check-row:last-child{border-bottom:none}
    .done{text-decoration:line-through;color:#a09585}
    .btn-download{display:block;background:#1e2327;color:#38bdf8;border:none;border-radius:8px;padding:12px 24px;font-size:14px;font-weight:700;letter-spacing:1px;text-decoration:none;text-align:center;margin-top:16px;cursor:pointer}
    .url-link{color:#38bdf8;word-break:break-all;font-size:14px;display:block;margin-top:8px}
    .meta{font-size:12px;color:#a09585;margin-top:8px;text-align:center}
  </style>
</head>
<body>
  <div class="header">
    <span>⚡ CHRONOS</span>
    <span>SHARED ${type.toUpperCase()}</span>
  </div>
  ${content}
  <p class="meta">Shared via Chronos &middot; Expires ${formatISTDisplay(expiresAt)}</p>
</body>
</html>`;
}

function expiredPage(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chronos — Link Expired</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf8f5;color:#1a1714;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;text-align:center}
    .icon{font-size:64px;margin-bottom:16px}
    h2{font-size:20px;margin-bottom:8px}
    p{color:#6b6050;font-size:14px}
  </style>
</head>
<body>
  <div class="icon">🔒</div>
  <h2>Link Expired or Invalid</h2>
  <p>This shared link is no longer available.</p>
</body>
</html>`;
}

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderNote(text: string, expiresAt: string, token: string): string {
	return pageShell("Note", `
  <div class="card">
    <div class="label">📝 Note</div>
    <div class="content">${esc(text)}</div>
  </div>`, expiresAt);
}

function renderList(name: string, items: { item: string; completed: number }[], expiresAt: string, token: string): string {
	const rows = items.map(i =>
		`<div class="check-row"><span>${i.completed ? "☑" : "☐"}</span><span class="${i.completed ? "done" : ""}">${esc(i.item)}</span></div>`
	).join("");
	return pageShell("List", `
  <div class="card">
    <div class="label">📋 ${esc(name)}</div>
    ${rows || "<p style='color:#a09585;font-size:14px'>No items</p>"}
  </div>`, expiresAt);
}

function renderDocument(label: string, fileType: string, token: string, expiresAt: string): string {
	const icon = fileType === "photo" ? "🖼️" : "📎";
	return pageShell("Document", `
  <div class="card">
    <div class="label">${icon} ${esc(fileType.toUpperCase())}</div>
    <div class="content">${esc(label)}</div>
    <a class="btn-download" href="/share/${token}/download">⬇️ DOWNLOAD FILE</a>
  </div>`, expiresAt);
}

function renderBookmark(url: string, label: string, expiresAt: string, token: string): string {
	return pageShell("Bookmark", `
  <div class="card">
    <div class="label">🔖 Bookmark</div>
    <div class="content">${esc(label)}</div>
    <a class="url-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>
  </div>`, expiresAt);
}
