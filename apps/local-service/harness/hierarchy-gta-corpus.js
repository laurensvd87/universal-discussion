// Prospective editorial labels, checked against the public English Wikipedia
// article title and its series infobox/lead on 2026-10-26, before GTA predictions.
// URLs name distinct games, not ports, translations, bundles or article variants.
// Curation is not a crawler rights/availability check or a model-quality result.
const canonicalPath=Object.freeze(['games','video-games','gta']);
const probe=(id,article,groupId,split,member)=>Object.freeze({
 id,groupId,split,member,rootId:'games',canonicalPath,language:'en',
 url:`https://en.wikipedia.org/wiki/${article}`,
 labelScope:'Rockstar-Grand-Theft-Auto-game-franchise-membership',
});

export const GTA_TRAIN_PROBES=Object.freeze([
 probe('gta-train-01','Grand_Theft_Auto_III','grand-theft-auto-iii-2001','training',true),
 probe('gta-train-02','Grand_Theft_Auto:_Vice_City','grand-theft-auto-vice-city-2002','training',true),
 probe('gta-train-03','Grand_Theft_Auto_IV','grand-theft-auto-iv-2008','training',true),
 probe('gta-train-04','Grand_Theft_Auto_V','grand-theft-auto-v-2013','training',true),
 probe('gta-train-05','Saints_Row_(2006_video_game)','saints-row-2006','training',false),
 probe('gta-train-06','Watch_Dogs_(video_game)','watch-dogs-2014','training',false),
 // The original 2002 Mafia game, not its 2020 remake or the series overview.
 probe('gta-train-07','Mafia_(video_game)','mafia-2002','training',false),
 // Red Dead means this distinct 2010 game, not a franchise overview.
 probe('gta-train-08','Red_Dead_Redemption','red-dead-redemption-2010','training',false),
]);

export const GTA_CAL_PROBES=Object.freeze([
 // The unsuffixed video-game article is the original 1997 GTA, not the series.
 probe('gta-cal-01','Grand_Theft_Auto_(video_game)','grand-theft-auto-original-1997','calibration',true),
 probe('gta-cal-02','Grand_Theft_Auto_2','grand-theft-auto-2-1999','calibration',true),
 probe('gta-cal-03','Grand_Theft_Auto:_San_Andreas','grand-theft-auto-san-andreas-2004','calibration',true),
 probe('gta-cal-04','Grand_Theft_Auto_Advance','grand-theft-auto-advance-2004','calibration',true),
 probe('gta-cal-05','Sleeping_Dogs_(video_game)','sleeping-dogs-2012','calibration',false),
 probe('gta-cal-06','Just_Cause_(video_game)','just-cause-2006','calibration',false),
 probe('gta-cal-07','Far_Cry_3','far-cry-3-2012','calibration',false),
 probe('gta-cal-08','L.A._Noire','la-noire-2011','calibration',false),
]);

// Frozen prospective final cohort. Fit must not request, encode or score it.
export const GTA_TEST_PROBES=Object.freeze([
 probe('gta-test-01','Grand_Theft_Auto:_Liberty_City_Stories','grand-theft-auto-liberty-city-stories-2005','test',true),
 probe('gta-test-02','Grand_Theft_Auto:_Vice_City_Stories','grand-theft-auto-vice-city-stories-2006','test',true),
 probe('gta-test-03','Grand_Theft_Auto:_Chinatown_Wars','grand-theft-auto-chinatown-wars-2009','test',true),
 probe('gta-test-04','Driver:_Parallel_Lines','driver-parallel-lines-2006','test',false),
 probe('gta-test-05','True_Crime:_Streets_of_LA','true-crime-streets-of-la-2003','test',false),
 probe('gta-test-06','Cyberpunk_2077','cyberpunk-2077-2020','test',false),
]);

export const GTA_CORPUS_SCOPE=Object.freeze({
 kind:'prospective-public-game-franchise-membership-corpus',canonicalPath,
 positiveDefinition:'The subject game is an entry in Rockstar Grand Theft Auto, including its standalone side entries.',
 negativeDefinition:'The subject game has another identity or franchise; shared genre, publisher, setting or a mention of GTA does not establish membership.',
 negativeLabelScope:'outside the GTA membership task, not outside Games or Video games; no parent STOP annotation',
 verifiedOn:'2026-10-26',sourceVerification:'English Wikipedia public article title plus series infobox or introductory identity statements',
 verifiedArticleUrls:Object.freeze([...GTA_TRAIN_PROBES,...GTA_CAL_PROBES,...GTA_TEST_PROBES].map(row=>row.url)),
 sourceReviewScope:'editorial game identity and franchise labels only; no retained page bodies, embeddings or model predictions',
 urlSemantics:'Use the exact article URLs above; title punctuation is literal. No entity-changing redirect was observed during web curation. Future collection must independently check its response.',
 hardNegativeNotes:Object.freeze({
  'saints-row-2006':'Original Saints Row entry; GTA gameplay comparisons do not change its franchise.',
  'watch-dogs-2014':'Original Ubisoft Watch Dogs entry, not a GTA game.',
  'mafia-2002':'Original Mafia crime game, distinct from GTA and from Mafia Definitive Edition.',
  'red-dead-redemption-2010':'Rockstar-published Red Dead game: shared publisher is deliberately insufficient.',
  'sleeping-dogs-2012':'Released as Sleeping Dogs; its True Crime development history does not establish GTA membership.',
  'just-cause-2006':'Original Just Cause entry; an open world does not establish GTA membership.',
  'far-cry-3-2012':'Far Cry entry with open-world combat, distinct from GTA.',
  'la-noire-2011':'Rockstar-published detective game, a same-publisher negative outside GTA.',
  'driver-parallel-lines-2006':'Driver-series crime/driving game, distinct from GTA.',
  'true-crime-streets-of-la-2003':'True Crime game; comparisons with GTA are contextual, not franchise membership.',
  'cyberpunk-2077-2020':'CD Projekt game in the Cyberpunk setting, distinct from GTA.',
 }),
 splitCounts:Object.freeze({training:8,calibration:8,test:6}),distinctGameEntityGroups:22,
 grouping:'one group per named game; ports, translations and alternate article spellings are not independent examples',
 franchiseCorrelation:'GTA positives share franchise, publisher, terminology and potentially article structure across splits; some negatives also share franchises or publishers.',
 statisticalIndependenceClaim:false,representativePopulation:false,
 gtaModelPredictionsSeen:false,embeddingsGenerated:false,collectorAvailabilityVerified:false,rightsVerified:false,
 recipeFineAssignmentEnabled:false,liveActivation:false,productionValidated:false,assignmentAuthority:false,
});
