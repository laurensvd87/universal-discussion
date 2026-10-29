// Public primary pages declared before capture under the already frozen focus
// policy. Gold scope annotations are evaluation-only, never classifier inputs.
// Root reviewed snippets/pages; this is not independent or population evidence.
export const GENERAL_WEB_SUBJECT_PROBES=Object.freeze([
 ['general-red-panda-01','red-panda','edinburghzoo.org.uk','en','https://www.edinburghzoo.org.uk/animals/animal-inhabitants/red-panda'],
 ['general-red-panda-02','red-panda','si.edu','en','https://www.nationalzoo.si.edu/animals/red-panda'],
 ['general-red-panda-03','red-panda','wwf.de','de','https://www.wwf.de/themen-projekte/artenlexikon/roter-panda-kleiner-panda'],
 ['general-giant-panda-01','giant-panda','si.edu','en','https://www.nationalzoo.si.edu/animals/giant-panda'],
 ['general-giant-panda-02','giant-panda','sandiegozoo.org','en','https://animals.sandiegozoo.org/animals/giant-panda'],
 ['general-steam-oled-01','steam-deck-oled','steamdeck.com','en','https://www.steamdeck.com/en/oled'],
 ['general-steam-oled-02','steam-deck-oled','ifixit.com','en','https://www.ifixit.com/Device/Steam_Deck_OLED'],
 ['general-steam-lcd-01','steam-deck-lcd','ifixit.com','en','https://www.ifixit.com/Device/Steam_Deck'],
 ['general-switch-2-01','nintendo-switch-2','nintendo.com','en','https://www.nintendo.com/us/gaming-systems/switch-2/'],
 ['general-switch-2-02','nintendo-switch-2','ifixit.com','en','https://www.ifixit.com/Device/Nintendo_Switch_2'],
 ['general-switch-oled-01','nintendo-switch-oled','nintendo.com','en','https://www.nintendo.com/us/gaming-systems/switch/oled-model/'],
 ['general-switch-oled-02','nintendo-switch-oled','ifixit.com','en','https://www.ifixit.com/Device/Nintendo_Switch_OLED_Model'],
].map(([id,expectedLeaf,publisherKey,language,url])=>Object.freeze({id,expectedLeaf,publisherKey,language,url})));
export const GENERAL_WEB_SUBJECT_PROTOCOL=Object.freeze({
 policy:'focus-policy.json frozen algorithm6dfb8459...e21580/minimumSimilarity0.8; no retuning on this screen.',
 scope:'General public animal/product pages, same-name neighbors, model variants and cross-language naming. No Wikipedia or required entity-provider data.',
 gold:'Expected leaf is an evaluation label. Broader valid subjects and missing specificity are reported separately from wrong scope. Do not assert event equality.',
 review:'Root-only snippets/primary page review before declaration; no independent reviewer or final population claim. Existing recipe/video examples remain inspected regression evidence, not new cohort members.',
 outcomes:'Keep all12 declared outcomes. No replacement, redirect-following or retry of a denied publisher. Do not access prior consumed hierarchy TEST artifacts.',
 maximumRequests:34,maximumCaptureMs:240000,minimumRequestSpacingMs:5000,
 captureExecuted:false,liveApproved:false,
});
