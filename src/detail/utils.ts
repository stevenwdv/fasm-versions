import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {IncomingMessage} from 'node:http';
import https from 'node:https';

const hashes = new Map<string, Promise<string>>();

export async function getHash(url: URL, forceRetry = false): Promise<string> {
	if (forceRetry) hashes.delete(url.href);
	if (!hashes.has(url.href)) hashes.set(url.href, (async () => {
		const res    = await httpsGet(url);
		const hasher = crypto.createHash('BLAKE2b512').setEncoding('hex');
		await pipeline(res, hasher);
		console.log(`downloaded ${url.href}`);
		return hasher.read() as string;
	})());
	return await hashes.get(url.href)!;
}

export class HttpError extends Error {
	constructor(readonly url: URL, readonly httpStatusCode?: number, options?: ErrorOptions) {
		super(`HTTP error${httpStatusCode !== undefined ? ` (${httpStatusCode})` : ''} while downloading ${url.href}`, options);
	}
}

export function httpsGet(url: URL): Promise<IncomingMessage> {
	return new Promise((resolve, reject) =>
		  // eslint-disable-next-line no-promise-executor-return
		  void https.get(url, {
			  // Try to prevent 'unsafe legacy renegotiation disabled' error because of unpatched flatassembler.net server
			  secureOptions: 0x40000000, /*SSL_OP_NO_RENEGOTIATION*/
		  }, res => {
			  if (res.statusCode !== 200)
				  reject(new HttpError(url, res.statusCode));
			  else resolve(res);
		  }).on('error', err => reject(new HttpError(url, undefined, {cause: err}))),
	);
}
