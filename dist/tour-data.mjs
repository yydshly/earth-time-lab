import {foundationChapters,foundationSources} from './tour-foundations.mjs';
import {countryChapters,cityChapters,placeSources} from './tour-places.mjs';
import {commonTimeChapters,commonTimeSources} from './common-time-data.mjs';
export const tourChapters=[...foundationChapters,...countryChapters,...cityChapters,...commonTimeChapters];
export const tourSources=[...foundationSources,...placeSources,...commonTimeSources];
export const tourTypes={foundation:'地球与时间',continent:'七洲巡游',country:'走进国家',city:'认识城市'};
export {narrationText,estimatedSeconds} from './tour-narration.mjs';
