export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "POST" && url.pathname === "/webhook") {
			const update = await request.json();
			console.log("Incoming Telegram update:", JSON.stringify(update));
			return new Response("OK", { status: 200 });
		}

		if (request.method === "GET" && url.pathname === "/cron") {
			return new Response("OK", { status: 200 });
		}

		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
