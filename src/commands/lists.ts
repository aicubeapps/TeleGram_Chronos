import {
	ListRow,
	ListItemRow,
	getActiveListByName,
	getListByName,
	getListById,
	getActiveLists,
	insertList,
	insertListItems,
	getListItems,
	markItemComplete,
	listActiveListsWithCounts,
	archiveListRow,
	deleteListCascade,
} from "../db/lists";
import { sendMessage, editMessageText, InlineKeyboardButton } from "../telegram";
import { attachListReminder } from "./reminders";

const GENERIC_ERROR = "Something went wrong, try again";
const LIST_USAGE = "Usage: /list <create|add|show|done|delete|remind> ...\nType /help for examples.";
const LIST_REMIND_USAGE =
	"Usage: /list remind <name> [item#] <date> <time>\nExample: /list remind Shopping tomorrow 10:00\nExample: /list remind Shopping 1 friday 18:00";

export function chunkButtons(buttons: InlineKeyboardButton[], size = 2): InlineKeyboardButton[][] {
	const rows: InlineKeyboardButton[][] = [];
	for (let i = 0; i < buttons.length; i += size) {
		rows.push(buttons.slice(i, i + size));
	}
	return rows;
}

function renderListView(list: ListRow, items: ListItemRow[]): { text: string; keyboard: InlineKeyboardButton[][] } {
	const pending = items.filter((i) => i.completed === 0).length;
	const lines = [`📋 ${list.name} (${pending} of ${items.length} remaining)`, ""];
	items.forEach((item, idx) => {
		lines.push(`${idx + 1}. ${item.completed ? "☑" : "☐"} ${item.item}`);
	});

	const buttons: InlineKeyboardButton[] = [];
	items.forEach((item, idx) => {
		if (!item.completed) {
			buttons.push({ text: `✅ ${item.item} (#${idx + 1})`, callback_data: `item_done:${item.id}:${list.id}` });
		}
	});

	return { text: lines.join("\n"), keyboard: chunkButtons(buttons) };
}

interface ListMatch {
	list: ListRow;
	rest: string;
}

async function matchListByPrefix(db: D1Database, chatId: string, restTokens: string[]): Promise<ListMatch | null> {
	const rawRest = restTokens.join(" ");
	const lowerRest = rawRest.toLowerCase();
	const lists = await getActiveLists(db, chatId);
	const sorted = [...lists].sort((a, b) => b.name.split(/\s+/).length - a.name.split(/\s+/).length);

	for (const list of sorted) {
		const nameLower = list.name.toLowerCase();
		if (lowerRest === nameLower) {
			return { list, rest: "" };
		}
		if (lowerRest.startsWith(`${nameLower} `)) {
			return { list, rest: rawRest.slice(list.name.length).trim() };
		}
	}
	return null;
}

export async function handleListCommand(env: Env, chatId: number, text: string): Promise<void> {
	const tokens = text.trim().split(/\s+/);
	const sub = (tokens[1] ?? "").toLowerCase();
	const rest = tokens.slice(2);

	switch (sub) {
		case "create":
			await handleListCreate(env, chatId, rest.join(" "));
			break;
		case "add":
			await handleListAdd(env, chatId, rest);
			break;
		case "show":
			await handleListShow(env, chatId, rest.join(" "));
			break;
		case "done":
			await handleListDone(env, chatId, rest.join(" "));
			break;
		case "delete":
			await handleListDelete(env, chatId, rest.join(" "));
			break;
		case "remind":
			await handleListRemind(env, chatId, rest);
			break;
		default:
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, LIST_USAGE);
	}
}

async function handleListCreate(env: Env, chatId: number, name: string): Promise<void> {
	if (!name) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Usage: /list create <name>\nExample: /list create Shopping");
		return;
	}

	try {
		const existing = await getActiveListByName(env.DB, String(chatId), name);
		if (existing) {
			await sendMessage(
				env.TELEGRAM_BOT_TOKEN,
				chatId,
				`⚠️ List '${name}' already exists.\nUse /list add ${name} [items] to add items.`,
			);
			return;
		}

		await insertList(env.DB, String(chatId), name);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ List created: ${name}\nAdd items with: /list add ${name} Milk, Eggs, Bread`);
	} catch (err) {
		console.error("handleListCreate: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

async function handleListAdd(env: Env, chatId: number, restTokens: string[]): Promise<void> {
	try {
		const match = await matchListByPrefix(env.DB, String(chatId), restTokens);
		if (!match) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "List not found. Create it first with /list create <name>.");
			return;
		}

		const items = match.rest
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);

		if (items.length === 0) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Usage: /list add ${match.list.name} <items, comma separated>`);
			return;
		}

		await insertListItems(env.DB, match.list.id, items);

		const lines = [`✅ Added ${items.length} item${items.length === 1 ? "" : "s"} to ${match.list.name}:`];
		for (const item of items) lines.push(`• ${item}`);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
	} catch (err) {
		console.error("handleListAdd: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

async function handleListShow(env: Env, chatId: number, name: string): Promise<void> {
	if (!name) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Usage: /list show <name>");
		return;
	}

	try {
		const list = await getActiveListByName(env.DB, String(chatId), name);
		if (!list) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `List '${name}' not found.`);
			return;
		}

		const items = await getListItems(env.DB, list.id);
		if (items.length === 0) {
			await sendMessage(
				env.TELEGRAM_BOT_TOKEN,
				chatId,
				`${list.name} has no items yet.\nAdd some with /list add ${list.name} Milk, Eggs, Bread`,
			);
			return;
		}

		const { text, keyboard } = renderListView(list, items);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text, keyboard.length > 0 ? keyboard : undefined);
	} catch (err) {
		console.error("handleListShow: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

async function handleListDone(env: Env, chatId: number, name: string): Promise<void> {
	if (!name) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Usage: /list done <name>");
		return;
	}

	try {
		const list = await getActiveListByName(env.DB, String(chatId), name);
		if (!list) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `List '${name}' not found.`);
			return;
		}

		await archiveListRow(env.DB, list.id);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `📦 ${list.name} archived.`);
	} catch (err) {
		console.error("handleListDone: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

async function handleListDelete(env: Env, chatId: number, name: string): Promise<void> {
	if (!name) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Usage: /list delete <name>");
		return;
	}

	try {
		const list = await getListByName(env.DB, String(chatId), name);
		if (!list) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `List '${name}' not found.`);
			return;
		}

		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Delete '${list.name}' and all its items permanently?`, [
			[
				{ text: "Yes, delete", callback_data: `confirm_delete_list:${list.id}` },
				{ text: "Cancel", callback_data: `cancel_delete_list:${list.id}` },
			],
		]);
	} catch (err) {
		console.error("handleListDelete: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

async function handleListRemind(env: Env, chatId: number, restTokens: string[]): Promise<void> {
	try {
		const match = await matchListByPrefix(env.DB, String(chatId), restTokens);
		if (!match) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "List not found. Create it first with /list create <name>.");
			return;
		}

		const remindTokens = match.rest.split(/\s+/).filter(Boolean);
		let itemNum: number | null = null;
		let dateTokens = remindTokens;

		if (/^\d+$/.test(remindTokens[0] ?? "")) {
			itemNum = parseInt(remindTokens[0], 10);
			dateTokens = remindTokens.slice(1);
		}

		const [dateStr, timeStr] = dateTokens;
		if (!dateStr || !timeStr) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, LIST_REMIND_USAGE);
			return;
		}

		await attachListReminder(env, chatId, match.list, itemNum, dateStr, timeStr);
	} catch (err) {
		console.error("handleListRemind: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleLists(env: Env, chatId: number): Promise<void> {
	try {
		const lists = await listActiveListsWithCounts(env.DB, String(chatId));
		if (lists.length === 0) {
			await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "You have no active lists.");
			return;
		}

		const lines = ["📋 Your Active Lists:", ""];
		for (const l of lists) {
			const total = l.total ?? 0;
			const pending = l.pending ?? 0;
			const suffix = total > 0 && pending === 0 ? " ✅" : "";
			lines.push(`📋 ${l.name} — ${pending} of ${total} pending${suffix}`);
		}
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
	} catch (err) {
		console.error("handleLists: failed:", err);
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, GENERIC_ERROR);
	}
}

export async function handleItemDone(env: Env, itemId: number, listId: number, chatId: number, messageId: number): Promise<void> {
	await markItemComplete(env.DB, itemId);

	const list = await getListById(env.DB, listId);
	if (!list) return;

	const items = await getListItems(env.DB, listId);
	const allComplete = items.length > 0 && items.every((i) => i.completed === 1);

	if (allComplete) {
		await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `🎉 ${list.name} list complete!`, [
			[
				{ text: "📋 Keep list", callback_data: `keep_list:${list.id}` },
				{ text: "🗑️ Archive list", callback_data: `archive_list:${list.id}` },
			],
		]);
	} else {
		const { text, keyboard } = renderListView(list, items);
		await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, text, keyboard);
	}
}

export async function handleShowListById(env: Env, chatId: number, listId: number): Promise<void> {
	const list = await getListById(env.DB, listId);
	if (!list || list.chat_id !== String(chatId)) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "List not found.");
		return;
	}

	const items = await getListItems(env.DB, listId);
	if (items.length === 0) {
		await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `${list.name} has no items yet.`);
		return;
	}

	const { text, keyboard } = renderListView(list, items);
	await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text, keyboard.length > 0 ? keyboard : undefined);
}

export async function handleKeepList(env: Env, chatId: number, messageId: number, originalText: string): Promise<void> {
	await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, originalText, []);
}

export async function handleArchiveListCallback(env: Env, chatId: number, listId: number, messageId: number): Promise<void> {
	const list = await getListById(env.DB, listId);
	if (!list || list.chat_id !== String(chatId)) {
		await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "List not found.", []);
		return;
	}
	await archiveListRow(env.DB, listId);
	await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `📦 ${list.name} archived.`, []);
}

export async function handleDeleteListConfirmed(env: Env, chatId: number, listId: number, messageId: number): Promise<void> {
	const list = await getListById(env.DB, listId);
	if (!list || list.chat_id !== String(chatId)) {
		await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "List not found.", []);
		return;
	}
	await deleteListCascade(env.DB, listId);
	await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, `🗑️ ${list.name} deleted.`, []);
}

export async function handleCancelDeleteList(env: Env, chatId: number, messageId: number): Promise<void> {
	await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId, messageId, "Cancelled.", []);
}
