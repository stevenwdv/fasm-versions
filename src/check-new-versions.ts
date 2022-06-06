#!/usr/bin/env ts-node

import crypto from 'crypto';
import fs from 'fs';
import {IncomingMessage} from 'http';
import https from 'https';
import process from 'process';
import consumers from 'stream/consumers';
import {pipeline} from 'stream/promises';

import {FasmData, FasmEditionStr, getUrls, PlatformStr} from './version-data';
import dataRaw from '../fasm_versions.json';

const data = dataRaw as FasmData;

async function main() {
	console.log('downloading fasm page');
	const page = await consumers.text(await httpsGet(pageUrl));

	function getVersions(pattern: RegExp): Set<string> {
		return new Set([...page.matchAll(pattern)].map(m => m.slice(1).filter(g => g)[0]!));
	}

	const newVersionsTotal = (await Promise.all(
		  [...versionPatterns.entries()].map(async ([edition, versionPattern]) => {
			  const foundVersions = getVersions(versionPattern);
			  if (!foundVersions.size) throw new Error(`Found 0 versions for ${edition}`);
			  const newVersions = [...foundVersions].filter(foundVersion =>
					!data.editions[edition].versions.find(v => v.name === foundVersion));
			  if (newVersions.length)
				  console.info(`found new version(s) for ${edition}: ${newVersions.join(', ')}`);

			  const versions = (await Promise.all(newVersions.map(async version => ({
				  name: version,
				  hashes: Object.fromEntries(await Promise.all(platforms.map(async platform =>
						[platform, await getHash(new URL(getUrls[edition]({name: version}, platform)[0]!))] as const))),
			  })))).sort();
			  for (const version of versions)
				  data.editions[edition].versions.unshift(version);
			  return newVersions.map(version => ({edition, version}));
		  }))).flat();

	if (newVersionsTotal.length) {
		fs.writeFileSync('../fasm_versions.json', JSON.stringify(data, undefined, '\t') + '\n');
		console.info(`added ${newVersionsTotal.length} new version(s) to fasm_versions.json`);
		console.log(`added [[${newVersionsTotal.map(({edition, version}) => `${edition} ${version}`).join(', ')}]]`);
	} else console.info('no new versions found');
}

const pageUrl = new URL('https://flatassembler.net/download.php');

const versionPatterns = new Map<FasmEditionStr, RegExp>([
	['fasm1', /\bfasm-(\S+)\.(?:tgz|tar\.gz)\b/g],
	['fasmg', /\bfasmg\.(\S+)\.zip\b/g],
]);

const platforms: PlatformStr[] = ['windows', 'linux', 'unix'];

const hashes = new Map<string, Promise<string>>();

async function getHash(url: URL): Promise<string> {
	if (!hashes.has(url.href)) hashes.set(url.href, (async () => {
		const res    = await httpsGet(url);
		const hasher = crypto.createHash('BLAKE2b512').setEncoding('hex');
		await pipeline(res, hasher);
		console.log(`downloaded ${url.href}`);
		return hasher.read() as string;
	})());
	return await hashes.get(url.href)!;
}

function httpsGet(url: URL): Promise<IncomingMessage> {
	return new Promise((resolve, reject) =>
		  // eslint-disable-next-line no-promise-executor-return
		  void https.get(url, {
			  // Prevent 'unsafe legacy renegotiation disabled' error because of unpatched flatassembler.net server
			  secureOptions: 0x40000000, /*SSL_OP_NO_RENEGOTIATION*/
		  }, res => {
			  if (res.statusCode !== 200)
				  reject(new Error(`Failed to download ${url.href}: HTTP ${res.statusCode!} ${res.statusMessage!}`));
			  else resolve(res);
		  }).on('error', err => reject(new Error(`Failed to download ${url.href}`, {cause: err}))),
	);
}

void (async () => {
	try {
		await main();
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
})();
