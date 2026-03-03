const RESTRICTED_FILES = [
	".env",
	".envrc",
	".secret_key",
	"id_rsa",
	"id_dsa",
	"id_ecdsa",
	"id_ed25519",
	".git-credentials",
	"credentials.json",
	"auth-profiles.json",
	".npmrc",
	".pypirc",
];
const RESTRICTED_SUFFIXES = [".pem", ".key", ".p12", ".pfx", ".kubeconfig", ".ovpn", ".netrc"];
const RESTRICTED_DIRS = [".ssh", ".aws", ".gnupg", ".kube", ".docker", ".azure", ".secrets"];
const CONFIDENTIAL_PATTERNS: RegExp[] = [
	/[A-Za-z0-9+/]{40,}={1,2}/,
	/sk-ant-[a-zA-Z0-9-]{32,}/,
	/Bearer\s+[A-Za-z0-9._~+/-]{20,}/,
	/sk-[a-zA-Z0-9]{32,}/,
	/ghp_[a-zA-Z0-9]{30,}/,
	/AKIA[0-9A-Z]{16}/,
	/-----BEGIN.*PRIVATE KEY-----/,
];

export function isSensitivePath(filePath: string): boolean {
	const normalized = filePath.replace(/\\/g, "/");
	const parts = normalized.split("/");
	const fileName = parts[parts.length - 1] ?? "";
	const lowerName = fileName.toLowerCase();
	for (const part of parts) {
		if (RESTRICTED_DIRS.includes(part.toLowerCase())) return true;
	}
	if (RESTRICTED_FILES.some((f) => lowerName === f.toLowerCase())) return true;
	if (lowerName.startsWith(".env.")) return true;
	if (RESTRICTED_SUFFIXES.some((s) => lowerName.endsWith(s))) return true;
	return false;
}

export function isConfidentialContent(content: string): boolean {
	return CONFIDENTIAL_PATTERNS.some((p) => p.test(content));
}

export function redactConfidential(content: string): string {
	let result = content;
	for (const pattern of CONFIDENTIAL_PATTERNS) {
		result = result.replace(new RegExp(pattern, "g"), "[REDACTED]");
	}
	return result;
}
