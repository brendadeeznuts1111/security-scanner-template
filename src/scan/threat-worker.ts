import {matchThreats, type MatcherInput, type ThreatMatch} from './matcher.ts';

declare const self: Worker;

self.onmessage = (event: MessageEvent<MatcherInput>) => {
	const matches: ThreatMatch[] = matchThreats(event.data);
	self.postMessage(matches);
};
