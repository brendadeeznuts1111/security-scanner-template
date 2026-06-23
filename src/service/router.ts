import type {RouteHandler} from './index.ts';

export interface ScannerRoute {
	path: string;
	handler: RouteHandler;
}

export interface FileSystemRouterOptions {
	dir: string;
	pattern?: string;
	/** Map filesystem stem to handler. */
	handlers: Record<string, RouteHandler>;
}

/**
 * Create a Bun.serve fetch handler from a filesystem route table.
 *
 * Uses Bun.FileSystemRouter when available; falls back to a manual map.
 */
export function createScannerRouter(options: FileSystemRouterOptions): RouteHandler {
	const FileSystemRouter = (
		Bun as {
			FileSystemRouter?: new (opts: {dir: string; style: string}) => {
				match: (pathname: string) => {name: string; params: Record<string, string>} | null;
			};
		}
	).FileSystemRouter;

	if (FileSystemRouter) {
		const router = new FileSystemRouter({
			dir: options.dir,
			style: 'nextjs',
		});

		return async (req: Request) => {
			const url = new URL(req.url);
			const match = router.match(url.pathname);
			if (!match) {
				return new Response('Not Found', {status: 404});
			}

			const handler = options.handlers[match.name];
			if (!handler) {
				return new Response('Scanner route not registered', {status: 501});
			}

			return handler(req);
		};
	}

	const manual = new Map<string, RouteHandler>();
	for (const [name, handler] of Object.entries(options.handlers)) {
		manual.set(`/scanners/${name}`, handler);
	}

	return async (req: Request) => {
		const url = new URL(req.url);
		const handler = manual.get(url.pathname);
		if (!handler) {
			return new Response('Not Found', {status: 404});
		}
		return handler(req);
	};
}

/**
 * Check whether Bun.FileSystemRouter is available.
 */
export function isFileSystemRouterAvailable(): boolean {
	return typeof (Bun as {FileSystemRouter?: unknown}).FileSystemRouter === 'function';
}
