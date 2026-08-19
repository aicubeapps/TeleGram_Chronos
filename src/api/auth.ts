async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
	const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

function toHex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface AuthResult {
	chatId: string;
}

// Validates Telegram Mini App initData per the official algorithm:
// secret_key = HMAC-SHA256(key="WebAppData", message=bot_token)
// expected_hash = HMAC-SHA256(key=secret_key, message=data_check_string)
export async function validateInitData(initData: string, botToken: string): Promise<AuthResult | null> {
	if (!initData) return null;

	const params = new URLSearchParams(initData);
	const hash = params.get("hash");
	if (!hash) return null;
	params.delete("hash");

	const dataCheckString = [...params.keys()]
		.sort()
		.map((key) => `${key}=${params.get(key)}`)
		.join("\n");

	try {
		const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
		const computedHash = toHex(await hmacSha256(secretKey, dataCheckString));

		if (computedHash !== hash) return null;

		const userJson = params.get("user");
		if (!userJson) return null;
		const user = JSON.parse(userJson) as { id: number };

		return { chatId: String(user.id) };
	} catch (err) {
		console.error("validateInitData: failed:", err);
		return null;
	}
}

export async function authenticateRequest(request: Request, env: Env): Promise<AuthResult | null> {
	const initData = request.headers.get("Authorization") ?? "";
	return validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
}
