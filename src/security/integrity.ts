/**
 * Skill Integrity Verifier — computes and verifies SHA-256 checksums
 * of skill files against a signed manifest.
 *
 * Manifest file: skills/.manifest.json
 * Format: { "files": { "relative/path.md": "sha256hex", ... }, "generatedAt": "ISO date" }
 */

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

export interface ManifestEntry {
	[filePath: string]: string; // relative path -> SHA-256 hex
}

export interface Manifest {
	files: ManifestEntry;
	generatedAt: string;
}

export interface VerificationResult {
	valid: boolean;
	issues: string[];
}

/**
 * Generate a manifest of all skill files under skillsDir.
 * Walks the directory recursively for .md files.
 */
export async function generateManifest(skillsDir: string): Promise<Manifest> {
	const files: ManifestEntry = {};
	await walkDir(skillsDir, skillsDir, files);
	return {
		files,
		generatedAt: new Date().toISOString(),
	};
}

/**
 * Save manifest to skills/.manifest.json
 */
export async function saveManifest(skillsDir: string, manifest: Manifest): Promise<void> {
	const path = join(skillsDir, ".manifest.json");
	await writeFile(path, JSON.stringify(manifest, null, 2), "utf-8");
}

/**
 * Load manifest from skills/.manifest.json
 */
export async function loadManifest(skillsDir: string): Promise<Manifest | null> {
	const path = join(skillsDir, ".manifest.json");
	try {
		const text = await readFile(path, "utf-8");
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * Verify all skill files match the manifest checksums.
 */
export async function verifyIntegrity(skillsDir: string): Promise<VerificationResult> {
	const manifest = await loadManifest(skillsDir);
	if (!manifest) {
		return { valid: false, issues: ["No manifest found — run generateManifest first"] };
	}

	const issues: string[] = [];
	const currentFiles: ManifestEntry = {};
	await walkDir(skillsDir, skillsDir, currentFiles);

	// Check each manifest entry
	for (const [filePath, expectedHash] of Object.entries(manifest.files)) {
		const currentHash = currentFiles[filePath];
		if (!currentHash) {
			issues.push(`Missing file: ${filePath}`);
		} else if (currentHash !== expectedHash) {
			issues.push(`Tampered file: ${filePath} (checksum mismatch)`);
		}
	}

	// Check for unexpected new files
	for (const filePath of Object.keys(currentFiles)) {
		if (!(filePath in manifest.files)) {
			issues.push(`Unexpected file: ${filePath} (not in manifest)`);
		}
	}

	return { valid: issues.length === 0, issues };
}

/** Compute SHA-256 of a file's content */
function hashFile(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

/** Recursively walk a directory, computing hashes for .md files */
async function walkDir(dir: string, baseDir: string, files: ManifestEntry): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			await walkDir(fullPath, baseDir, files);
		} else if (entry.name.endsWith(".md")) {
			const content = await readFile(fullPath, "utf-8");
			const relPath = relative(baseDir, fullPath).replace(/\\/g, "/");
			files[relPath] = hashFile(content);
		}
	}
}
