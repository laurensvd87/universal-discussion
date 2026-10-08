'use strict';

// Independently authored synthetic challenge data. Each family deliberately
// separates a precise contested development from a different development by
// the same entity, plus a related singleton that must not match either topic.
const cases = [
  ['harborline','harborline-dockgate-approval','supports','Harborline approves DockGate crane brake retrofit','Harborline Port Authority voted to fit DockGate brakes to every container crane after a winter near miss. Backers say the retrofit is the fastest practical safeguard.'],
  ['harborline','harborline-dockgate-approval','opposes','DockGate retrofit is an expensive Harborline mistake','Harborline commissioners approved DockGate crane brakes following a winter near miss. Critics say the rushed retrofit spends on hardware before fixing operator training.'],
  ['harborline','harborline-ferry-terminal-delay','supports','Harborline pauses South Ferry terminal rebuild','Harborline Port Authority delayed the South Ferry terminal rebuild for six months. Supporters welcome time to redesign flood barriers.'],
  ['harborline','harborline-ferry-terminal-delay','opposes','Six-month South Ferry delay strands Harborline commuters','Harborline Port Authority postponed its South Ferry terminal reconstruction. Opponents say the delay leaves commuters with unsafe temporary berths.'],
  ['harborline','harborline-tide-curriculum','neutral','Harborline schools add a tide-table lesson','Harborline middle schools will teach local tide tables in science class next spring.'],

  ['helixforge','helixforge-orbit-7-recall','supports','HelixForge recalls Orbit 7 smart kettles','HelixForge issued a voluntary recall for Orbit 7 kettles after a sensor defect. Advocates praise the company for replacing units before injuries occur.'],
  ['helixforge','helixforge-orbit-7-recall','opposes','Orbit 7 recall arrives too late, customers say','HelixForge recalled Orbit 7 kettles over a sensor flaw. Critics say the voluntary program should have begun when early overheating reports appeared.'],
  ['helixforge','helixforge-lumen-app-subscription','supports','HelixForge makes Lumen recipe app a subscription','HelixForge will charge a monthly fee for its Lumen recipe app. Supporters say subscriptions fund regular accessibility updates.'],
  ['helixforge','helixforge-lumen-app-subscription','opposes','HelixForge puts basic Lumen recipes behind a fee','HelixForge is moving the Lumen recipe app to a monthly plan. Opponents say buyers were promised useful recipes with their appliances.'],
  ['helixforge','helixforge-tea-festival','neutral','HelixForge sponsors a tea blending festival','HelixForge will sponsor the annual Northbank tea blending festival.'],

  ['redwood-civic','redwood-civic-night-bus-pilot','supports','Redwood launches overnight Route 18 buses','Redwood Civic Transit approved a three-month overnight Route 18 pilot. Supporters say shift workers finally gain a dependable ride home.'],
  ['redwood-civic','redwood-civic-night-bus-pilot','opposes','Route 18 night pilot wastes Redwood transit funds','Redwood Civic Transit authorized overnight Route 18 service for three months. Critics say sparse ridership cannot justify the extra drivers.'],
  ['redwood-civic','redwood-civic-fare-capping','supports','Redwood adopts weekly fare cap','Redwood Civic Transit will cap weekly fares for contactless riders. Advocates call the policy a simple relief for regular passengers.'],
  ['redwood-civic','redwood-civic-fare-capping','opposes','Redwood fare cap excludes cash riders','Redwood Civic Transit approved a weekly contactless fare ceiling. Opponents say people without bank cards receive none of its benefit.'],
  ['redwood-civic','redwood-civic-bus-mural','neutral','Redwood invites designs for bus-stop murals','Redwood Civic Transit opened a student contest for murals at five bus stops.'],

  ['lyra-athletic','lyra-athletic-vale-captaincy','supports','Lyra Athletic names Vale captain for the final','Lyra Athletic selected midfielder Niko Vale as captain for Saturday’s cup final. Fans say his calm leadership earned the armband.'],
  ['lyra-athletic','lyra-athletic-vale-captaincy','opposes','Lyra’s Vale captaincy overlooks senior defenders','Lyra Athletic gave Niko Vale the captaincy for the cup final. Detractors argue veteran defenders have carried the season.'],
  ['lyra-athletic','lyra-athletic-east-stand-closure','supports','Lyra closes East Stand for structural checks','Lyra Athletic will close the East Stand for two matches while engineers inspect cracks. Supporters prefer caution over a packed unsafe section.'],
  ['lyra-athletic','lyra-athletic-east-stand-closure','opposes','East Stand closure punishes Lyra season-ticket holders','Lyra Athletic shut the East Stand pending structural checks. Critics say the club offered inadequate alternatives to displaced fans.'],
  ['lyra-athletic','lyra-athletic-youth-clinic','neutral','Lyra Athletic schedules goalkeeper clinic','Lyra Athletic announced a free goalkeeper clinic for children during school break.'],

  ['solmere','solmere-wetland-buffer-rule','supports','Solmere adopts a 40-metre wetland buffer','Solmere Council approved a 40-metre building buffer around mapped wetlands. Supporters say the rule protects floodwater and nesting sites.'],
  ['solmere','solmere-wetland-buffer-rule','opposes','Solmere wetland buffer freezes modest housing plans','Solmere Council passed a 40-metre wetland setback. Opponents say the uniform line blocks small infill projects with little environmental risk.'],
  ['solmere','solmere-market-square-vote','supports','Solmere backs car-free Saturday market square','Solmere Council voted to close Market Square to cars on Saturdays. Backers expect safer stalls and more foot traffic.'],
  ['solmere','solmere-market-square-vote','opposes','Car-free Saturdays make Solmere market deliveries harder','Solmere Council approved Saturday vehicle restrictions at Market Square. Critics say vendors cannot unload under the new timetable.'],
  ['solmere','solmere-orchard-map','neutral','Solmere publishes heritage orchard map','Solmere library released a walking map of historic orchard trees.'],

  ['northstar-labs','northstar-labs-pulsepatch-clearance','supports','Northstar wins clearance for PulsePatch monitor','Northstar Labs received national clearance for its PulsePatch heart monitor. Supporters say home monitoring could catch warning signs earlier.'],
  ['northstar-labs','northstar-labs-pulsepatch-clearance','opposes','PulsePatch clearance does not prove Northstar monitor is ready','Northstar Labs gained clearance for PulsePatch. Skeptics say clearance establishes basic safety, not the accuracy claims in its marketing.'],
  ['northstar-labs','northstar-labs-trial-data-delay','supports','Northstar delays trial-data release for audit','Northstar Labs postponed publication of its asthma trial dataset for an outside audit. Defenders say verification matters more than a flashy deadline.'],
  ['northstar-labs','northstar-labs-trial-data-delay','opposes','Northstar’s audit delay leaves patients waiting','Northstar Labs pushed back release of asthma trial data. Critics say the unexplained timetable weakens trust in the study.'],
  ['northstar-labs','northstar-labs-stem-scholarship','neutral','Northstar funds laboratory scholarships','Northstar Labs created ten laboratory technician scholarships at Seafield College.'],

  ['fieldstone-energy','fieldstone-energy-cedar-battery','supports','Fieldstone opens Cedar Grid battery','Fieldstone Energy switched on the Cedar Grid battery beside its wind farm. Supporters say stored power will reduce evening fossil generation.'],
  ['fieldstone-energy','fieldstone-energy-cedar-battery','opposes','Cedar battery gives Fieldstone too little local benefit','Fieldstone Energy opened the Cedar Grid battery. Opponents say nearby residents bear construction traffic while electricity profits leave town.'],
  ['fieldstone-energy','fieldstone-energy-ridge-survey','supports','Fieldstone surveys Ridge Line for turbines','Fieldstone Energy began a bird and wind survey along Ridge Line. Supporters say measuring first is a responsible approach to new capacity.'],
  ['fieldstone-energy','fieldstone-energy-ridge-survey','opposes','Ridge Line survey is Fieldstone’s first step toward industrializing hills','Fieldstone Energy started a Ridge Line turbine survey. Critics fear the study signals a project that will damage the landscape.'],
  ['fieldstone-energy','fieldstone-energy-solar-workshop','neutral','Fieldstone hosts home solar workshop','Fieldstone Energy will host a weekend workshop on rooftop solar maintenance.'],

  ['paperkite','paperkite-lantern-2-patch','supports','PaperKite fixes Lantern 2 note-loss bug','PaperKite released a Lantern 2 update that restores notes lost during offline edits. Users welcome a direct repair for a frustrating defect.'],
  ['paperkite','paperkite-lantern-2-patch','opposes','PaperKite patch cannot excuse Lantern 2 data loss','PaperKite shipped an update for Lantern 2 offline note loss. Critics say a patch does not compensate people who lost work.'],
  ['paperkite','paperkite-studio-layoffs','supports','PaperKite trims Studio team to keep editor independent','PaperKite cut twelve Studio positions while keeping its editor independently owned. Supporters call the painful move preferable to a sale.'],
  ['paperkite','paperkite-studio-layoffs','opposes','PaperKite layoffs hollow out the Studio product','PaperKite eliminated twelve Studio jobs. Opponents say fewer designers will slow the editor’s promised improvements.'],
  ['paperkite','paperkite-zine-grant','neutral','PaperKite offers neighborhood zine grants','PaperKite announced small grants for printed neighborhood zines.'],

  ['bracken-university','bracken-university-archive-return','supports','Bracken returns river survey archive to Kestrel Nation','Bracken University agreed to return a nineteenth-century river survey archive to Kestrel Nation. Supporters call the transfer overdue stewardship.'],
  ['bracken-university','bracken-university-archive-return','opposes','Bracken archive return needs wider scholarly access','Bracken University will transfer the river survey archive to Kestrel Nation. Critics want a public digitization agreement before materials leave campus.'],
  ['bracken-university','bracken-university-dorm-lease','supports','Bracken leases empty dorm wing to nurses','Bracken University leased an unused dormitory wing to travelling nurses. Backers say it helps the regional hospital fill shifts.'],
  ['bracken-university','bracken-university-dorm-lease','opposes','Nurse lease changes Bracken dorm life without student input','Bracken University rented an empty dorm wing to travelling nurses. Opponents say students were excluded from a decision affecting shared facilities.'],
  ['bracken-university','bracken-university-astronomy-night','neutral','Bracken observatory plans public meteor night','Bracken University’s observatory will open for a public meteor-viewing night.'],

  ['copper-finance','copper-finance-sprout-fee-reversal','supports','Copper Finance reverses Sprout account fee','Copper Finance withdrew a planned monthly fee for Sprout savings accounts after customer feedback. Supporters say public pressure worked.'],
  ['copper-finance','copper-finance-sprout-fee-reversal','opposes','Copper’s Sprout fee reversal avoids the real service problem','Copper Finance cancelled its proposed Sprout account fee. Critics say the bank still has not improved its slow branch service.'],
  ['copper-finance','copper-finance-harbor-branch-sale','supports','Copper sells Harbor branch building','Copper Finance sold its aging Harbor branch property and will serve customers from a smaller office. Backers say the sale frees capital for online security.'],
  ['copper-finance','copper-finance-harbor-branch-sale','opposes','Harbor branch sale abandons Copper’s older customers','Copper Finance sold the Harbor branch building. Opponents say the smaller replacement office is harder for older customers to reach.'],
  ['copper-finance','copper-finance-budget-class','neutral','Copper Finance runs a school budgeting class','Copper Finance volunteers will teach a budgeting class at Alder Secondary.'],

  ['morrow-books','morrow-books-aster-censor','supports','Morrow Books restores Aster chapter removed in error','Morrow Books restored a chapter missing from the new Aster edition after confirming a production error. Readers praise the correction.'],
  ['morrow-books','morrow-books-aster-censor','opposes','Aster restoration highlights Morrow’s careless editing','Morrow Books put back a chapter omitted from the Aster edition. Critics say the mistake should have been caught before thousands of copies shipped.'],
  ['morrow-books','morrow-books-shop-closure','supports','Morrow closes Old Quay shop to expand delivery hub','Morrow Books will close its Old Quay store and enlarge a delivery hub. Supporters say the move keeps the independent chain solvent.'],
  ['morrow-books','morrow-books-shop-closure','opposes','Old Quay closure erases Morrow’s community bookstore','Morrow Books is shutting its Old Quay shop for a delivery hub. Opponents say the store hosted an irreplaceable local reading space.'],
  ['morrow-books','morrow-books-poetry-prize','neutral','Morrow announces first-poem prize','Morrow Books launched a prize for unpublished first poems.'],

  ['dawn-cascade','dawn-cascade-trail-permit','supports','Dawn Cascade caps permits on Glassfall trail','Dawn Cascade Park will limit daily Glassfall trail permits during nesting season. Supporters say the cap protects a fragile cliff habitat.'],
  ['dawn-cascade','dawn-cascade-trail-permit','opposes','Glassfall permit cap turns a public trail into a lottery','Dawn Cascade Park imposed daily Glassfall trail limits. Critics say families without flexible schedules lose access to their own park.'],
  ['dawn-cascade','dawn-cascade-visitor-center','supports','Dawn Cascade rebuilds visitor center with local timber','Dawn Cascade Park approved a visitor-center rebuild using local timber. Backers say the design replaces a leaking building with a modest one.'],
  ['dawn-cascade','dawn-cascade-visitor-center','opposes','Dawn Cascade visitor center is a costly vanity rebuild','Dawn Cascade Park authorized a new visitor center. Opponents say trail repairs deserve priority over an architectural project.'],
  ['dawn-cascade','dawn-cascade-frog-count','neutral','Dawn Cascade seeks volunteers for frog count','Dawn Cascade Park asked residents to join its spring frog count.'],

  ['varnish-motors','varnish-motors-lumen-brake-recall','supports','Varnish recalls Lumen vans for brake hose check','Varnish Motors recalled Lumen delivery vans to inspect brake hoses. Supporters say the precaution places safety above schedules.'],
  ['varnish-motors','varnish-motors-lumen-brake-recall','opposes','Lumen brake recall exposes Varnish quality failures','Varnish Motors called back Lumen vans over brake hoses. Critics say a basic component problem points to weak factory oversight.'],
  ['varnish-motors','varnish-motors-plant-shift','supports','Varnish adds weekend shift at River plant','Varnish Motors added a weekend shift at its River plant to meet fleet demand. Advocates welcome the new paid hours.'],
  ['varnish-motors','varnish-motors-plant-shift','opposes','Weekend River shift risks burnout at Varnish plant','Varnish Motors introduced a weekend River plant shift. Opponents say mandatory overtime will exhaust an already stretched workforce.'],
  ['varnish-motors','varnish-motors-design-scholarship','neutral','Varnish funds vehicle-design scholarship','Varnish Motors created a vehicle-design scholarship for technical students.'],

  ['civic-thread','civic-thread-ballot-font','supports','Civic Thread enlarges ballot type for municipal vote','Civic Thread election office approved larger ballot type for the municipal vote. Supporters say clearer print improves independent voting.'],
  ['civic-thread','civic-thread-ballot-font','opposes','Larger Civic Thread ballot creates needless printing costs','Civic Thread election office changed municipal ballots to larger type. Critics say the office failed to compare cheaper accessibility options.'],
  ['civic-thread','civic-thread-district-map','supports','Civic Thread releases draft district map early','Civic Thread election office published a draft district map six months before hearings. Supporters say early release allows meaningful review.'],
  ['civic-thread','civic-thread-district-map','opposes','Civic Thread map draft locks in biased boundaries','Civic Thread election office issued a preliminary district map. Opponents say the proposal splits the waterfront neighborhood without justification.'],
  ['civic-thread','civic-thread-poll-worker-poster','neutral','Civic Thread displays poll-worker history poster','Civic Thread election office installed a poster on the history of poll workers.'],

  ['mistral-network','mistral-network-signal-bridge','supports','Mistral activates Signal Bridge community broadband','Mistral Network activated Signal Bridge fiber for three rural hamlets. Supporters say reliable service ends years of isolation.'],
  ['mistral-network','mistral-network-signal-bridge','opposes','Signal Bridge launch leaves Mistral’s monthly price too high','Mistral Network switched on Signal Bridge fiber. Critics say the advertised connection remains unaffordable for many rural households.'],
  ['mistral-network','mistral-network-data-center','supports','Mistral proposes small data center at rail depot','Mistral Network proposed a compact data center at the former rail depot. Backers say it can reuse vacant land and create technical jobs.'],
  ['mistral-network','mistral-network-data-center','opposes','Mistral data center plan threatens depot water supply','Mistral Network sought approval for a rail-depot data center. Opponents fear its cooling demand will strain the local water system.'],
  ['mistral-network','mistral-network-coding-club','neutral','Mistral starts after-school coding club','Mistral Network will provide volunteers for an after-school coding club.'],

  ['ember-foods','ember-foods-oatbar-label','supports','Ember Foods corrects Oatbar allergen label','Ember Foods recalled one Oatbar batch to correct an undeclared sesame label. Supporters say the quick notice protects families.'],
  ['ember-foods','ember-foods-oatbar-label','opposes','Ember’s Oatbar label error should trigger broader review','Ember Foods pulled Oatbar packs for a missing sesame warning. Critics say the company must examine its whole labeling process.'],
  ['ember-foods','ember-foods-cannery-sale','supports','Ember sells North Cannery to local cooperative','Ember Foods sold North Cannery to a worker cooperative. Backers say the deal preserves food production in the town.'],
  ['ember-foods','ember-foods-cannery-sale','opposes','North Cannery sale lets Ember walk away from workers','Ember Foods transferred North Cannery to a cooperative. Opponents say Ember should have guaranteed longer-term transition support.'],
  ['ember-foods','ember-foods-soup-kitchen','neutral','Ember donates jars to soup kitchen','Ember Foods donated preserved vegetables to the Riverside soup kitchen.'],

  ['oriel-museum','oriel-museum-sun-vault-return','supports','Oriel returns Sun Vault masks to Awan Coast','Oriel Museum agreed to return the Sun Vault masks to Awan Coast custodians. Supporters say cultural authority belongs with the community.'],
  ['oriel-museum','oriel-museum-sun-vault-return','opposes','Sun Vault return needs a stronger preservation pact','Oriel Museum will transfer the Sun Vault masks to Awan Coast. Critics want binding conservation support before the move.'],
  ['oriel-museum','oriel-museum-late-hours','supports','Oriel adds free Thursday evening hours','Oriel Museum will open free on Thursday evenings. Advocates say workers gain a real chance to visit.'],
  ['oriel-museum','oriel-museum-late-hours','opposes','Oriel late hours shift costs onto underpaid staff','Oriel Museum extended Thursday hours without raising admission. Opponents say staffing the schedule relies on poorly compensated workers.'],
  ['oriel-museum','oriel-museum-sketch-day','neutral','Oriel hosts family sketch day','Oriel Museum announced a family sketching day in its sculpture hall.'],

  ['quarry-county','quarry-county-willow-clinic','supports','Quarry County funds Willow mobile clinic','Quarry County approved a mobile Willow clinic for remote villages. Supporters say the van brings routine care closer to patients.'],
  ['quarry-county','quarry-county-willow-clinic','opposes','Willow clinic van cannot replace Quarry County doctors','Quarry County funded a Willow mobile clinic. Critics say occasional visits do not solve the shortage of permanent doctors.'],
  ['quarry-county','quarry-county-gravel-ban','supports','Quarry County bans gravel hauling on school mornings','Quarry County barred gravel trucks from school routes during morning arrival. Backers say the rule makes crossings safer.'],
  ['quarry-county','quarry-county-gravel-ban','opposes','Morning gravel restriction harms Quarry County contractors','Quarry County restricted gravel hauling near schools before classes. Opponents say the narrow delivery window raises costs for small contractors.'],
  ['quarry-county','quarry-county-seed-library','neutral','Quarry County opens seed library','Quarry County library opened a seed-lending shelf for home gardeners.'],

  ['aeroverge','aeroverge-kitewing-grounding','supports','AeroVerge grounds KiteWing drones after navigation fault','AeroVerge halted KiteWing deliveries after a navigation fault sent two drones off route. Supporters say grounding the fleet is responsible.'],
  ['aeroverge','aeroverge-kitewing-grounding','opposes','KiteWing grounding reveals AeroVerge tested too soon','AeroVerge suspended KiteWing drones over a navigation error. Critics say the company launched deliveries before proving reliability.'],
  ['aeroverge','aeroverge-hangar-lease','supports','AeroVerge leases Eastfield hangar for apprentices','AeroVerge leased part of Eastfield hangar for an aircraft-maintenance apprenticeship. Backers say the program creates a practical path into aviation.'],
  ['aeroverge','aeroverge-hangar-lease','opposes','Eastfield hangar lease gives AeroVerge public space cheaply','AeroVerge secured an Eastfield hangar lease for apprentices. Opponents say the company received favorable terms without open bidding.'],
  ['aeroverge','aeroverge-glider-day','neutral','AeroVerge sponsors glider day','AeroVerge will sponsor a youth glider day at the regional airfield.'],
];

const viewpointFor = (value) => value;
const topicLabelFor = (value) => value;

export const documents = Object.freeze(cases.map(([family, topicLabel, viewpoint, title, body], index) => Object.freeze({
  id: `next-challenge-${String(index + 1).padStart(3, '0')}`,
  family,
  topicLabel: topicLabelFor(topicLabel),
  viewpoint: viewpointFor(viewpoint),
  title,
  body,
})));

export default documents;
