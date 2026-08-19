import { handleStart, handleRemind, handleList, handleDelete } from "./commands/reminders";
import { saveDocument, handleFiles, handleRecall, handleDeleteDocument } from "./commands/documents";
import { handleNote, handleNotes, handleDeleteNote } from "./commands/notes";
import { handleBookmark, handleBookmarks, handleRecallBookmark, handleDeleteBookmark, containsUrl } from "./commands/bookmarks";
import { handleUnifiedSearch } from "./commands/search";
import { handleListCommand, handleLists } from "./commands/lists";
import { handleSummary } from "./commands/dashboard";
import { HELP_TEXT } from "./commands/help";
import { handleCallbackQuery } from "./commands/callbacks";
import { dispatchCron } from "./cron/dispatch";
import { handleAPI } from "./api/router";
import { sendMessage } from "./telegram";
import { TelegramUpdate } from "./types";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/api/")) {
			return handleAPI(request, env);
		}

		if (request.method === "POST" && url.pathname === "/webhook") {
			let update: TelegramUpdate;
			try {
				update = await request.json();
			} catch (err) {
				console.error("Failed to parse Telegram update:", err);
				return new Response("OK", { status: 200 });
			}
			console.log("Incoming Telegram update:", JSON.stringify(update));

			if (update.message) {
				const message = update.message;
				const chatId = message.chat.id;

				if (message.document || message.photo) {
					await saveDocument(env, message);
				} else {
					const text = (message.text ?? "").trim();
					const tokens = text.split(/\s+/);
					const firstToken = (tokens[0] ?? "").split("@")[0].toLowerCase();

					switch (firstToken) {
						case "/start":
							await handleStart(env, chatId);
							break;
						case "/remind":
							await handleRemind(env, chatId, text);
							break;
						case "/list": {
							const listSub = (tokens[1] ?? "").toLowerCase();
							if (["create", "add", "show", "done", "delete", "remind"].includes(listSub)) {
								await handleListCommand(env, chatId, text);
							} else {
								await handleList(env, chatId);
							}
							break;
						}
						case "/lists":
							await handleLists(env, chatId);
							break;
						case "/delete": {
							const target = (tokens[1] ?? "").toLowerCase();
							if (target === "doc") {
								await handleDeleteDocument(env, chatId, text);
							} else if (target === "note") {
								await handleDeleteNote(env, chatId, text);
							} else if (target === "bookmark") {
								await handleDeleteBookmark(env, chatId, text);
							} else {
								await handleDelete(env, chatId, text);
							}
							break;
						}
						case "/search":
							await handleUnifiedSearch(env, chatId, text);
							break;
						case "/files":
							await handleFiles(env, chatId);
							break;
						case "/recall":
							if ((tokens[1] ?? "").toLowerCase() === "bookmark") {
								await handleRecallBookmark(env, chatId, text);
							} else {
								await handleRecall(env, chatId, text);
							}
							break;
						case "/note":
							await handleNote(env, chatId, text);
							break;
						case "/notes":
							await handleNotes(env, chatId);
							break;
						case "/bookmark":
							await handleBookmark(env, chatId, text);
							break;
						case "/bookmarks":
							await handleBookmarks(env, chatId);
							break;
						case "/summary":
							await handleSummary(env, chatId);
							break;
						case "/help":
							await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, HELP_TEXT);
							break;
						default:
							if (containsUrl(text)) {
								await handleBookmark(env, chatId, text);
							} else {
								await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Unknown command. Type /help");
							}
					}
				}
			} else if (update.callback_query) {
				await handleCallbackQuery(env, update.callback_query);
			}

			return new Response("OK", { status: 200 });
		}

		if (request.method === "GET" && url.pathname === "/cron") {
			const result = await dispatchCron(env);
			return new Response(JSON.stringify(result), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response("Not Found", { status: 404 });
	},

	async scheduled(controller, env, ctx): Promise<void> {
		ctx.waitUntil(dispatchCron(env));
	},
} satisfies ExportedHandler<Env>;
