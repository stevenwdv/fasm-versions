#!/usr/bin/env -S npx ts-node

import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import consumers from 'node:stream/consumers';

import {FasmData, FasmEditionStr, getUrls, PlatformStr} from './version-data';
import dataRaw from '../fasm_versions.json';
import {getHash, httpsGet} from './detail/utils';

const data = dataRaw as FasmData;

async function main() {
	console.log('downloading fasm page');
	const page = await consumers.text(await httpsGet(downloadPage));

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
						[platform, await getHash(getUrls[edition]({name: version}, platform)[0]!)] as const))),
			  })))).sort();
			  for (const version of versions)
				  data.editions[edition].versions.unshift(version);
			  return newVersions.map(version => ({edition, version}));
		  }))).flat();

	if (newVersionsTotal.length) {
		await fsp.writeFile(path.resolve(__dirname, '../fasm_versions.json'), JSON.stringify(data, undefined, '\t') + '\n');
		console.info(`added ${newVersionsTotal.length} new version(s) to fasm_versions.json`);
		console.log(`added [[${newVersionsTotal.map(({edition, version}) => `${edition} ${version}`).join(', ')}]]`);
	} else console.info('no new versions found');
}

const downloadPage = new URL('https://flatassembler.net/download.php');

const versionPatterns = new Map<FasmEditionStr, RegExp>([
	['fasm1', /\bfasm-(\S+)\.(?:tgz|tar\.gz)\b/g],
	['fasmg', /\bfasmg\.(\S+)\.zip\b/g],
]);

const platforms: PlatformStr[] = ['windows', 'linux', 'unix'];

void (async () => {
	try {
		await main();
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
})();
