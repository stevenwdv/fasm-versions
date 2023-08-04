#!/usr/bin/env -S npx ts-node

import process from 'node:process';
import {FasmData, FasmEdition, FasmEditionStr, getUrls, PlatformStr} from './version-data';
import dataRaw from '../fasm_versions.json';
import {getHash, HttpError} from './detail/utils';
import fsp from 'node:fs/promises';
import path from 'node:path';

const data = dataRaw as FasmData;

const officialOrigin     = 'https://flatassembler.net';
const maxVersionsToCheck = 10;
const maxTlsErrorRetries = 6;

async function main() {
	const updatedHashes: { edition: FasmEditionStr, version: string }[] = [];
	let versionsChecked                                                 = 0;
	for (const [edition, editionObj] of
		  Object.entries(data.editions) as [FasmEditionStr, FasmEdition][])
		for (const version of editionObj.versions) {
			if (versionsChecked++ === maxVersionsToCheck) {
				console.log('reached limit of versions to check');
				break;
			}
			if (!version.hashes) continue;
			let officialDownloadAvailable = false;
			for (const [platform, expectedHash] of
				  Object.entries(version.hashes) as [PlatformStr, string][]) {
				for (const officialUrl of getUrls[edition](version, platform)
					  .filter(url => url.origin === officialOrigin)) downloadUrl: {
					let currentHash;
					let retry = 0;
					while (true) {
						try {
							currentHash = await getHash(officialUrl, retry > 0);
						} catch (err) {
							if (err instanceof HttpError) {
								if (err.httpStatusCode === 404) {
									console.info(err);
									break downloadUrl;
								} else if (!err.httpStatusCode && retry++ < maxTlsErrorRetries) {
									console.warn(err);
									continue;
								}
							}
							throw err;
						}
						break;
					}
					officialDownloadAvailable = true;
					if (currentHash !== expectedHash) {
						updatedHashes.push({edition, version: version.name});
						console.info(`${edition} ${version.name} for ${platform}: Expected hash ${expectedHash} but got ${currentHash}`);
						version.hashes[platform] = currentHash;
					}
				}
			}
			if (!officialDownloadAvailable) {
				console.log(`no official downloads found for ${edition} ${version.name}, assuming we hit an old version`);
				break;
			}
		}
	if (updatedHashes.length) {
		await fsp.writeFile(path.resolve(__dirname, '../fasm_versions.json'), JSON.stringify(data, undefined, '\t') + '\n');
		console.info(`updated hashes for [[${
			  updatedHashes.map(({edition, version}) => `${edition} ${version}`).join(', ')}]]`);
	} else console.info('All checked official hashes are OK');
}

void (async () => {
	try {
		await main();
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
})();
