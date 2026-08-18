import { handleStart, handleRemind, handleList, handleDelete, HELP_TEXT } from "./commands/reminders";
import { handleCallbackQuery } from "./commands/callbacks";
import { dispatchCron } from "./cron/dispatch";
import { sendMessage } from "./telegram";
import { TelegramUpdate } from "./types";

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

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
				const chatId = update.message.chat.id;
				const text = (update.message.text ?? "").trim();
				const firstToken = (text.split(/\s+/)[0] ?? "").split("@")[0].toLowerCase();

				switch (firstToken) {
					case "/start":
						await handleStart(env, chatId);
						break;
					case "/remind":
						await handleRemind(env, chatId, text);
						break;
					case "/list":
						await handleList(env, chatId);
						break;
					case "/delete":
						await handleDelete(env, chatId, text);
						break;
					case "/help":
						await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, HELP_TEXT);
						break;
					default:
						await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Unknown command. Type /help");
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
} satisfies ExportedHandler<Env>;
