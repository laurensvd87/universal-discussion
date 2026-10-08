// Invented English articles for a shadow Topic-encoder experiment.
// Labels and split metadata are evaluation-only. Feed only title and body to a model.
// Within each family: A and B are distinct atomic developments; C has no partner.
// The two accounts for A and B disagree about the same development.
const stories = [
  ['train', 'bellweather-ferry', [
    ['a','Bellweather ferry trial gets an evening sailing','The island council approved a three-month 9:40 pm sailing on the Bellweather route. Shop workers say the extra boat will let them finish a shift without sleeping on the mainland. The trial starts in April.','for'],
    ['a','Late Bellweather crossing draws questions over cost','A new 9:40 pm ferry will run to Bellweather for three months from April. Some islanders welcome a way home after work; others say a nearly empty boat will drain money from the daytime timetable.','against'],
    ['b','Bellweather ferry dock closes for ramp repair','The council will close Bellweather’s eastern landing for six days to replace a corroded passenger ramp. Daytime ferries will use the west pier while crews inspect the bolts and handrails.','for'],
    ['b','Ramp works leave Bellweather passengers with longer walk','Six days of repairs at the east ferry landing will divert arrivals to Bellweather’s west pier. Accessibility campaigners say the corroded ramp needs fixing but criticize the long, steep temporary route.','against'],
    ['c','Bellweather fishing boats contest new berth fees','Small fishing crews asked the harbor board to reconsider annual berth charges at Bellweather. The fee schedule covers commercial boats and is due for a separate vote next month.','neutral'],
  ]],
  ['train', 'copperline-school', [
    ['a','Copperline schools vote for classroom phone lockers','Copperline trustees approved lockers for student phones during lessons, beginning next term. Teachers expect fewer interruptions and say pupils can retrieve devices at the final bell.','for'],
    ['a','Parents object to Copperline lesson-time phone lockers','The Copperline board will require pupils to place phones in classroom lockers next term. Parents worry that a locked device could slow emergency contact even though the school offers an office line.','against'],
    ['b','Copperline board adds morning bus to south campus','A new 7:15 am bus will serve Copperline’s south campus after attendance staff documented late arrivals. The board funded one route for a semester and will review passenger numbers.','for'],
    ['b','South campus bus plan criticized for narrow reach','Copperline’s planned 7:15 am bus may help one corridor reach school on time. Families farther east say the single route ignores their longer journeys despite using the same attendance budget.','against'],
    ['c','Copperline library opens a weekend makerspace','The town library has reserved Saturday afternoons for supervised electronics workshops. Registration is voluntary and places are allocated through the library rather than the school board.','neutral'],
  ]],
  ['train', 'mira-patch', [
    ['a','Mira patch adult migraine trial reports fewer attacks','Researchers reported fewer monthly migraine days among adults assigned the Mira skin patch in a controlled study. The authors favor a larger trial before any clinical use.','for'],
    ['a','Small adult Mira study cannot settle migraine benefit','A controlled adult study of the Mira migraine patch reported fewer attacks, but clinicians questioned the short follow-up and uneven withdrawals. They want a larger trial before recommending it.','against'],
    ['b','Mira patch receives adolescent dosing study approval','An ethics board cleared a separate trial to test patch dosing in adolescents with migraine. Recruitment will begin in autumn; no outcome data from these younger participants exist yet.','for'],
    ['b','Teen Mira patch study faces recruitment concerns','Plans for an adolescent migraine patch trial have ethics clearance, but patient advocates question whether the recruitment materials explain skin reactions clearly enough. Results are still years away.','against'],
    ['c','Migraine clinic begins remote follow-up appointments','A regional clinic opened video follow-up slots for patients adjusting preventive medicines. The scheduling change applies across treatments and does not involve an investigational patch.','neutral'],
  ]],
  ['train', 'quartz-phone', [
    ['a','Quartz Q7 battery recall covers first production run','Quartz is recalling batteries in early Q7 handsets after overheating reports. Owners can check serial numbers and receive a replacement cell at authorized repair shops.','for'],
    ['a','Q7 recall response leaves customers facing delays','The first run of Quartz Q7 phones needs replacement batteries after overheating reports. Consumer groups praise the recall but say repair appointments are scarce in rural areas.','against'],
    ['b','Quartz Q7 gains offline map download in update','Quartz released a Q7 software update that lets users store regional maps for trips without a connection. The feature requires free storage and is rolling out by country.','for'],
    ['b','Offline maps update strains Quartz Q7 storage','A new Q7 update adds downloadable maps, useful on remote trips. Reviewers say the files consume too much of the smaller phone’s storage and should offer finer region choices.','against'],
    ['c','Quartz suppliers announce recycled aluminum target','The phone maker’s frame supplier aims to increase recycled aluminum in next year’s production. Its statement covers several device lines, with no specific Q7 hardware change announced.','neutral'],
  ]],
  ['train', 'redbank-bridge', [
    ['a','Redbank bridge reopens one lane after inspection','Engineers cleared one lane of Redbank Bridge for buses and emergency vehicles following a bearing inspection. The restriction remains while the damaged joint is repaired.','for'],
    ['a','Limited Redbank crossing frustrates local drivers','Redbank Bridge now has one inspected lane reserved for buses and emergency vehicles. Businesses on the far bank say the arrangement still forces deliveries onto a lengthy detour.','against'],
    ['b','Redbank bridge replacement design selects cable span','The transport authority chose a cable-supported design for a future Redbank crossing. The design vote concerns a replacement planned for late in the decade, with procurement still open.','for'],
    ['b','Cable design for future Redbank crossing faces scrutiny','Officials selected a cable span for the proposed replacement of Redbank Bridge. Architects question the price of the design and ask why a simpler structure was not compared publicly.','against'],
    ['c','Redbank waterfront footpath closes for drainage work','A riverside walking path will close for two weeks while contractors repair drains beneath the paving. The work is funded by the parks department and has no vehicle crossing.','neutral'],
  ]],
  ['train', 'cedarball-league', [
    ['a','Cedarball league confirms final after rain delay','The Cedarball league moved its cup final to Sunday after waterlogged pitches ruled out Saturday play. Ticket holders can use the original passes at the rescheduled match.','for'],
    ['a','Sunday cup final causes travel headache for supporters','Rain pushed the Cedarball cup final from Saturday to Sunday. Fans accept the unsafe pitch but say the league announced the new date too late to change paid train tickets.','against'],
    ['b','Cedarball league expands promotion playoff field','League clubs voted to give two additional teams a place in next season’s promotion playoff. The change affects league standings rather than the current cup competition.','for'],
    ['b','Bigger promotion playoff draws criticism from champions','Two more clubs will enter next season’s Cedarball promotion playoff. Leading teams argue that a longer bracket dilutes the reward for finishing higher across the league season.','against'],
    ['c','Cedarball referees publish new training handbook','The referees association released guidance on advantage calls for junior fixtures. Its course begins in summer and does not alter the senior league competition format.','neutral'],
  ]],
  ['train', 'lynx-forest', [
    ['a','Lynx Forest gains protected northern corridor','The regional assembly voted to protect a northern wildlife corridor linking two sections of Lynx Forest. Conservationists expect safer migration for large mammals after fencing is removed.','for'],
    ['a','Forest corridor protection worries nearby farms','A newly protected corridor north of Lynx Forest will connect habitat across old grazing land. Farmers say the boundary was drawn before compensation for lost access was settled.','against'],
    ['b','Lynx Forest wildfire team tests remote sensors','Forestry officers began a summer trial of smoke sensors on towers across Lynx Forest. The devices send alerts to a local control room when heat and particulate readings rise.','for'],
    ['b','Sensor trial in Lynx Forest raises false-alarm fears','A network of smoke and heat sensors is being tested across Lynx Forest this summer. Volunteer firefighters worry frequent false alarms could divert crews from confirmed incidents.','against'],
    ['c','Forest museum acquires century-old logging photographs','A small museum near Lynx Forest received a donated collection of logging photographs. Curators plan an exhibition about timber workers and the area’s former rail line.','neutral'],
  ]],
  ['train', 'northglass-tower', [
    ['a','Northglass Tower residents approve lift replacement','Residents voted to replace the main lift in Northglass Tower after repeated breakdowns. The housing association plans an accessible temporary shuttle while installation takes place.','for'],
    ['a','Northglass lift replacement raises service-charge dispute','A new lift for Northglass Tower won a resident vote, but leaseholders dispute how the housing association will divide the installation bill. They want the service charge reviewed.','against'],
    ['b','Northglass Tower receives fire-door inspection order','Inspectors ordered checks on every fire door in Northglass Tower after a stairwell survey found gaps around several frames. The housing association has thirty days to report findings.','for'],
    ['b','Fire-door checks at Northglass called too slow','The association must inspect Northglass Tower’s fire doors within thirty days following a stairwell survey. Residents say the order should require immediate temporary patrols as well.','against'],
    ['c','Northglass neighborhood garden opens allotment lottery','The council invited applications for sixteen garden plots beside Northglass Tower. The lottery is open to nearby households and is administered by the parks office.','neutral'],
  ]],
  ['train', 'orion-mission', [
    ['a','Orion mission delays launch for valve replacement','Engineers moved the Orion weather probe launch by nine days to replace a valve in its fueling system. Mission managers say the spacecraft is otherwise ready for orbit.','for'],
    ['a','Valve delay puts Orion weather launch schedule under pressure','The Orion weather probe will launch nine days later because of a fueling valve replacement. Analysts support the safety check but question whether the revised schedule leaves enough test time.','against'],
    ['b','Orion mission releases first cloud images from orbit','The Orion weather probe transmitted its first cloud images after calibration in orbit. Scientists will compare the pictures with ground observations before releasing operational forecasts.','for'],
    ['b','Early Orion images impress, but calibration remains unfinished','New cloud images from the orbiting Orion weather probe are sharp, yet forecasters caution that the instrument has not completed calibration. They dispute claims of immediate forecast gains.','against'],
    ['c','Astronomy club restores old observatory telescope','Volunteers repaired a historic telescope in the public observatory. The instrument will be used for weekend star parties rather than weather monitoring or spacecraft operations.','neutral'],
  ]],
  ['train', 'saltmarsh-court', [
    ['a','Saltmarsh court blocks warehouse permit over wetland map','A Saltmarsh court suspended a warehouse permit because the planning file used an outdated wetland boundary. The developer may submit a revised environmental map.','for'],
    ['a','Warehouse permit suspension divides Saltmarsh workers','A judge suspended the Saltmarsh warehouse permit over an outdated wetland map. Environmental groups call it proper scrutiny; prospective employees say a correctable map error has stalled jobs.','against'],
    ['b','Saltmarsh court orders disclosure in harbor contract case','The Saltmarsh court directed the port authority to disclose bids for a harbor maintenance contract. The ruling allows journalists to inspect pricing with narrow trade-secret redactions.','for'],
    ['b','Harbor bid disclosure ruling concerns Saltmarsh contractors','A Saltmarsh judge ordered release of maintenance bids with limited redactions. Contractors warn that publication may reveal their methods and make future tendering more expensive.','against'],
    ['c','Saltmarsh harbor installs public tide gauge','The port authority mounted a tide gauge on the public quay. Sailors can read local water levels online, and schools plan to use the data for science lessons.','neutral'],
  ]],
  ['validation', 'glenmere-rail', [
    ['a','Glenmere rail adds an early airport train','The operator approved a 4:50 am Glenmere-to-airport service for six months. Airline staff hope to reach the first shift by rail, with ridership reviewed in November.','for'],
    ['a','Early Glenmere airport train questioned over subsidy','A 4:50 am airport train will run from Glenmere during a six-month trial. Commuters welcome the link, but local councilors question the per-passenger subsidy at that hour.','against'],
    ['b','Glenmere rail replaces cracked platform canopy','Glenmere station will close platform two on two weekends to replace a cracked canopy. Trains will use adjacent tracks and signs will direct passengers to a temporary entrance.','for'],
    ['b','Canopy works bring weekend access problems at Glenmere','A cracked platform-two canopy at Glenmere station is being replaced over two weekends. Disability groups say the temporary platform route is much longer than the operator’s notice suggests.','against'],
    ['c','Glenmere airport reviews taxi pickup zone','Airport managers proposed moving taxis to a covered pickup zone near terminal three. The consultation addresses road congestion outside the terminal.','neutral'],
  ]],
  ['validation', 'amberlake-water', [
    ['a','Amberlake authority approves new reservoir intake','The Amberlake water board approved a deeper reservoir intake to avoid summer algae blooms. Engineers expect construction to finish before next year’s warm season.','for'],
    ['a','Deeper Amberlake intake meets lake habitat concerns','A new deep-water intake will supply Amberlake during summer algae blooms. Anglers say the construction could disturb spawning habitat and ask for tighter seasonal limits.','against'],
    ['b','Amberlake water board extends bill assistance','The board extended its household bill assistance scheme to renters whose water charges are bundled with rent. Applications open next month with proof of tenancy.','for'],
    ['b','Renters welcome Amberlake relief but fault application rules','Amberlake’s expanded water bill assistance now includes tenants with bundled charges. Housing advocates worry that requiring landlord documents will exclude many eligible renters.','against'],
    ['c','Amberlake swimmers organize shoreline cleanup','A volunteer group will remove litter from two public beaches after a holiday weekend. The event does not involve treatment infrastructure or utility billing.','neutral'],
  ]],
  ['validation', 'valence-camera', [
    ['a','Valence V5 receives portrait color update','Valence released a V5 camera update that changes skin-tone rendering in portrait mode. Users can compare the new processing with the original setting in the camera app.','for'],
    ['a','Portrait update on Valence V5 draws mixed reviews','The V5’s revised portrait color processing gives faces a warmer look. Some photographers welcome the option, while others say the default oversaturates darker skin tones.','against'],
    ['b','Valence V5 repair manual becomes public','Valence published a service manual for V5 screen and battery replacements. Independent shops can consult it, although they must still order parts through the company’s portal.','for'],
    ['b','Published V5 manual stops short of open repair','Independent repairers can now read Valence’s V5 service manual. Shop owners say the parts portal and diagnostic lock still prevent them from performing many repairs.','against'],
    ['c','Photography fair announces student grant','A regional photography fair opened applications for its annual student grant. The award covers exhibition printing and travel to the fair.','neutral'],
  ]],
  ['validation', 'ravel-orchestra', [
    ['a','Ravel Orchestra announces youth ticket program','The Ravel Orchestra will reserve discounted seats for under-25 listeners at each autumn concert. The plan uses a donor fund and begins with the September season.','for'],
    ['a','Youth seats at Ravel concerts prompt access debate','A donor fund will pay for discounted under-25 tickets at the Ravel Orchestra this autumn. Older low-income listeners say an age-only rule overlooks their need for affordable seats.','against'],
    ['b','Ravel Orchestra selects new principal conductor','The Ravel Orchestra appointed conductor Mara Senn to a three-year term beginning in January. She will choose guest artists and lead six subscription concerts per season.','for'],
    ['b','Ravel conductor appointment faces repertoire concerns','Mara Senn will lead the Ravel Orchestra for three years from January. Musicians praise her rehearsal work, but subscribers fear she will narrow the range of contemporary music.','against'],
    ['c','Ravel hall replaces lobby heating system','The concert hall closed its lobby for a week to install heat pumps. Performances continued through a side entrance while contractors worked.','neutral'],
  ]],
  ['holdout', 'tarnwick-hospital', [
    ['a','Tarnwick hospital opens overnight stroke unit','Tarnwick Hospital opened an overnight stroke unit with a neurologist on call. Supporters expect faster treatment for patients arriving after regular clinic hours.','for'],
    ['a','Overnight stroke unit opens amid Tarnwick staffing doubts','The new overnight stroke unit at Tarnwick Hospital promises faster care, but nurses say the roster relies too heavily on temporary staff. They seek permanent posts before expansion.','against'],
    ['b','Tarnwick hospital pauses elective hip operations','Tarnwick Hospital paused elective hip operations for two weeks while a theatre ventilation system is repaired. Emergency surgery continues in another wing.','for'],
    ['b','Hip surgery pause leaves Tarnwick patients waiting again','Ventilation repairs have halted elective hip operations at Tarnwick Hospital for two weeks. Surgeons say the pause is prudent, but patients criticize the late notice and renewed delays.','against'],
    ['c','Tarnwick health charity funds garden benches','A local charity bought benches for a public garden beside Tarnwick Hospital. Volunteers plan to install them before summer visiting hours increase.','neutral'],
  ]],
  ['holdout', 'fenwick-election', [
    ['a','Fenwick mayoral recount confirms narrow result','Election officers completed a Fenwick mayoral recount and confirmed the incumbent’s twelve-vote win. The revised tally changed the margin by two votes.','for'],
    ['a','Fenwick recount result accepted, ballot rules challenged','The incumbent still won Fenwick’s mayoral race after a recount. Opposition observers accept the tally but say unclear rules for damaged ballots should be reviewed before the next election.','against'],
    ['b','Fenwick mayor proposes parking levy after election','Fenwick’s mayor introduced a proposed downtown parking levy at the first council meeting of the new term. Members will debate exemptions for night workers in June.','for'],
    ['b','New Fenwick parking levy proposal angers shop owners','At a council meeting, Fenwick’s mayor proposed a levy on downtown parking. Shop owners say the draft could drive customers away and ask council to publish a traffic study.','against'],
    ['c','Fenwick volunteers map old boundary markers','A history society is photographing boundary stones around Fenwick for a public archive. Its project is funded by a museum grant.','neutral'],
  ]],
  ['holdout', 'pallas-game', [
    ['a','Pallas game patch reduces ranked match timer','The latest Pallas Arena patch shortens the ranked match timer from twelve to ten minutes. Developers say shorter rounds address player feedback about stalled endgames.','for'],
    ['a','Shorter Pallas ranked timer frustrates careful players','Ranked games in Pallas Arena now end after ten minutes instead of twelve. Competitive players argue the patch rewards rushed attacks over defensive strategy.','against'],
    ['b','Pallas Arena announces regional server migration','Pallas Arena will move its western region to a new server cluster on Tuesday. The publisher expects two hours of downtime and promises to preserve accounts and rankings.','for'],
    ['b','Regional Pallas server move sparks latency concerns','The publisher is moving Pallas Arena’s western players to a new cluster. Streamers welcome modernization but fear the chosen location will raise latency for coastal teams.','against'],
    ['c','Pallas art book receives translated edition','A publisher announced a translated edition of the Pallas Arena concept art book. It includes sketches and artist interviews, with no changes to the game client.','neutral'],
  ]],
  ['holdout', 'islet-wind', [
    ['a','Islet wind project wins seabed lease','The Islet offshore wind project secured a seabed lease for forty turbines after a competitive auction. Developers must still submit an environmental assessment.','for'],
    ['a','Islet seabed award brings worries over fishing grounds','A lease for forty Islet offshore turbines gives the developer a route to planning. Fishing crews argue that the auction ignored seasonal trawling grounds inside the area.','against'],
    ['b','Islet wind project delays cable landing decision','The Islet developer postponed choosing a shore cable landing until autumn after residents challenged the proposed dune route. Two inland alternatives remain under review.','for'],
    ['b','Cable route delay prolongs uncertainty for Islet coast','The Islet wind developer will wait until autumn to select a cable landing. Conservation groups welcome scrutiny of the dunes, while nearby homeowners say the prolonged search leaves them unable to plan.','against'],
    ['c','Islet lighthouse receives new visitor path','The heritage agency opened a raised walkway to the Islet lighthouse. The public path protects nesting areas and was funded through a tourism grant.','neutral'],
  ]],
  ['holdout', 'meridian-rail', [
    ['a','Meridian Rail releases winter timetable with later last train','Meridian Rail’s winter schedule moves the final eastbound departure to 11:25 pm. Theater workers say the later service will make evening shifts easier.','for'],
    ['a','Later Meridian train leaves western stops behind','The winter timetable gives Meridian Rail a later eastbound departure at 11:25 pm. Riders on the western branch say their last connection still ends too early.','against'],
    ['b','Meridian Rail settles tunnel flood compensation','Meridian Rail agreed to compensate passengers stranded during a tunnel flood in March. Claims cover documented travel costs and close after sixty days.','for'],
    ['b','Tunnel flood settlement criticized for narrow eligibility','After March’s tunnel flood, Meridian Rail offered refunds for documented travel expenses. Passenger advocates say the settlement excludes missed hourly wages and people without receipts.','against'],
    ['c','Meridian station mural wins local design award','A ceramic mural at Meridian’s central station received a design prize. Local artists created the work during a station renovation last year.','neutral'],
  ]],
  ['holdout', 'nacre-tablet', [
    ['a','Nacre tablet gains handwriting search update','The Nacre T8 update lets owners search words inside handwritten notebooks. The feature runs on-device after the tablet indexes existing pages.','for'],
    ['a','Nacre handwriting search struggles with cursive notes','Owners of the Nacre T8 can now search handwriting in notebooks. Reviewers find the feature useful for block letters but unreliable with cursive notes and mixed languages.','against'],
    ['b','Nacre T8 display warranty extended for bright spots','Nacre extended the T8 display warranty to cover bright spots appearing within three years. Affected owners can request a panel replacement without an additional charge.','for'],
    ['b','Display warranty change leaves older Nacre owners out','The new three-year Nacre T8 warranty covers bright display spots. Owners of the previous T7 say the same defect affects their devices but remains outside the repair offer.','against'],
    ['c','Nacre design studio opens public exhibition','Nacre’s design studio is showing sketches of early tablet prototypes at a local gallery. The exhibition has no device sales or software announcement.','neutral'],
  ]],
];

export const corpus = Object.freeze(stories.flatMap(([split, family, rows]) => rows.map(([topic, title, body, stance], index) => Object.freeze({
  id: `${family}-${index + 1}`, split, family, topicId: `${family}-${topic}`, stance, title, body,
}))));

export const splits = Object.freeze({
  train: Object.freeze(corpus.filter(d => d.split === 'train')),
  validation: Object.freeze(corpus.filter(d => d.split === 'validation')),
  holdout: Object.freeze(corpus.filter(d => d.split === 'holdout')),
});
