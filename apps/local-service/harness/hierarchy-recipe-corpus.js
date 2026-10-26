// Prospective dish-versus-technique labels. "recipes" here means a specific
// prepared dish/food and its recipes, not every culinary method or baking craft.
// These annotations refine selected historical root-only gold editorially; they
// are not inferred from model predictions. Unknown child membership stays unknown.
export const RECIPE_TRAIN_MEMBER_GROUPS = Object.freeze([
  'omelette-dish', 'spaetzle-noodle-dish', 'poffertjes-griddle-batter-dish', 'gazpacho-soup-family',
]);
// Explicit STOP applies only within the current 16-roots-plus-recipes tree.
// Broad sourdough/pastry material remains a cooking prefix with unknown children.
export const RECIPE_TRAIN_STOP_GROUPS = Object.freeze([
  'braising-cooking-technique', 'food-fermentation-process',
]);
export const RECIPE_CAL_POSITIVE_GROUPS = Object.freeze([
  'risotto-dish-family', 'sauerkraut-food-preparation', 'sushi-dish-family',
]);

const probe = (id, article, groupId, split, recipeMember) => Object.freeze({
  id, groupId, split, recipeMember, rootId: 'cooking', language: 'en',
  url: `https://en.wikipedia.org/wiki/${article}`,
  labelScope: 'specific-prepared-dish-versus-general-culinary-technique',
});

// All four negatives are predeclared and retained, including unavailable rows.
// Three available known negatives remain necessary; no replacement after scoring.
export const RECIPE_CAL_PROBES = Object.freeze([
  probe('recipe-cal-01', 'Simmering', 'simmering-method', 'calibration', false),
  probe('recipe-cal-02', 'Steaming', 'steaming-method', 'calibration', false),
  probe('recipe-cal-03', 'Poaching_(cooking)', 'poaching-method', 'calibration', false),
  probe('recipe-cal-04', 'Grilling', 'grilling-method', 'calibration', false),
]);

// Subject labels are fixed before fitting. The fit command must not request,
// encode, read vectors for, or score this cohort; evaluation uses frozen cuts.
export const RECIPE_TEST_PROBES = Object.freeze([
  probe('recipe-test-01', 'Shakshouka', 'shakshouka-dish', 'test', true),
  probe('recipe-test-02', 'Paella', 'paella-dish', 'test', true),
  probe('recipe-test-03', 'Moussaka', 'moussaka-dish', 'test', true),
  probe('recipe-test-04', 'Roasting', 'roasting-method', 'test', false),
  probe('recipe-test-05', 'Deep_frying', 'deep-frying-method', 'test', false),
  probe('recipe-test-06', 'Blanching_(cooking)', 'blanching-method', 'test', false),
]);

export const RECIPE_CORPUS_SCOPE = Object.freeze({
  branch: ['cooking', 'recipes'], definition: 'specific prepared dishes/foods and their recipes',
  outsideBranch: 'general culinary techniques without a specific dish as their subject',
  representativePopulation: false, statisticalIndependenceClaim: false,
  taxonomyScope: 'development branch control, not the complete production hierarchy',
  reusedRootOnlyCalibrationIsNotIndependentValidation: true,
  liveActivation: false,
});
