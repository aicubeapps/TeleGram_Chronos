import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("Chronos worker", () => {
	it("returns 404 for unknown routes (unit style)", async () => {
		const request = new IncomingRequest("http://example.com/unknown");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(404);
	});

	it("returns 200 for GET /cron (integration style)", async () => {
		const response = await SELF.fetch("https://example.com/cron");
		expect(response.status).toBe(200);
	});

	it("returns 200 for POST /webhook (integration style)", async () => {
		const response = await SELF.fetch("https://example.com/webhook", {
			method: "POST",
			body: JSON.stringify({ update_id: 1 }),
			headers: { "Content-Type": "application/json" },
		});
		expect(response.status).toBe(200);
	});
});
