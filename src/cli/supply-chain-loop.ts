import {colorize, TERMINAL} from '../color/index.ts';
import {emitOperatorIssues} from '../logging/operator-log.ts';
import {
	applySupplyChainRemediationPlan,
	planSupplyChainRemediation,
	supplyChainReportToDoctorIssues,
} from '../intel/supply-chain-remediation.ts';
import {
	collectSupplyChainDeepScanReport,
	emitSupplyChainDeepScanReport,
	type SupplyChainDeepScanOptions,
} from './supply-chain-scan.ts';
import {supplyChainScanHasBlockingFindings} from '../report/supply-chain-report.ts';

export interface SupplyChainLoopOptions extends SupplyChainDeepScanOptions {
	/** Apply auto-fixable remediations and re-scan until clean or maxRounds. */
	fix?: boolean;
	maxRounds?: number;
	/** Write findings to `.security/operator.jsonl`. */
	operatorLog?: boolean;
}

const DEFAULT_MAX_ROUNDS = 3;

/**
 * Scan → plan remediation queue → optionally apply → re-scan loop.
 */
export async function runSupplyChainDeepScanLoop(
	options: SupplyChainLoopOptions,
): Promise<number> {
	const maxRounds = options.maxRounds ?? (options.fix ? DEFAULT_MAX_ROUNDS : 1);
	let lastExit = 0;

	for (let round = 1; round <= maxRounds; round++) {
		const report = await collectSupplyChainDeepScanReport(options);
		const plan = planSupplyChainRemediation(report);
		lastExit = supplyChainScanHasBlockingFindings(report) ? 1 : 0;

		if (options.operatorLog && report.projectRoot) {
			await emitOperatorIssues(report.projectRoot, supplyChainReportToDoctorIssues(report));
		}

		const isLastRound = round === maxRounds;
		const shouldApply = options.fix === true && plan.autoFixableCount > 0 && !isLastRound;

		if (shouldApply && report.projectRoot) {
			if (options.format !== 'json' && !options.output) {
				console.error(
					colorize(
						TERMINAL.scannerInfo,
						`[supply-chain] round ${round}/${maxRounds}: applying ${plan.autoFixableCount} auto-fix(es)…`,
					),
				);
			}
			const applied = await applySupplyChainRemediationPlan(
				report.projectRoot,
				report,
				plan,
			);
			for (const result of applied.results) {
				if (options.format !== 'json' && !options.output) {
					console.error(
						colorize(
							result.ok ? TERMINAL.scannerOk : TERMINAL.scannerFatal,
							`  [${result.action}] ${result.target}: ${result.message}`,
						),
					);
				}
			}
			continue;
		}

		await emitSupplyChainDeepScanReport(report, options, plan);
		return lastExit;
	}

	return lastExit;
}