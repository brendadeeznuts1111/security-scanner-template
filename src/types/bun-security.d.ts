export {};

declare global {
	namespace Bun {
		namespace Security {
			interface Package {
				name: string;
				version: string;
				requestedRange: string;
				tarball: string;
			}

			interface Advisory {
				level: 'fatal' | 'warn';
				package: string;
				url: string | null;
				description: string | null;
			}

			interface Scanner {
				version: '1';
				scan(input: {packages: Package[]}): Promise<Advisory[]>;
			}
		}
	}
}
