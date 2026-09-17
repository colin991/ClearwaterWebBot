export const PCSO_STATIC_PAGES = [
  {
    slug: 'sheriff',
    title: 'Sheriff Noah Richards',
    eyebrow: 'About',
    lead: 'Leadership of the Pinellas County Sheriff’s Office.',
    body: [
      'Sheriff Noah Richards leads the Pinellas County Sheriff’s Office with a focus on professionalism, accountability, and service to the community.',
      'The Office of the Sheriff sets department standards for patrol, investigations, detention, and public information so every member of PCSO represents one county and one standard.',
      'Questions for the Office of the Sheriff can be opened from Contact on this website or through the PCSO Discord support panel.',
    ],
  },
  {
    slug: 'missions-values',
    title: 'Missions and Values',
    eyebrow: 'About',
    lead: 'What PCSO stands for in Clearwater Roleplay.',
    body: [
      'Our mission is to protect Pinellas County, support our members, and make every shift count.',
      'Core values: Professionalism, Integrity, and Service. Deputies are expected to communicate clearly, follow policy, and treat the public with respect.',
      'Training, ride-alongs, and command review exist so those values show up on the road, in the jail, and in every report.',
    ],
  },
  {
    slug: 'public-notices',
    title: 'Public Notices',
    eyebrow: 'About',
    lead: 'Official notices, policy updates, and community announcements.',
    body: [
      'Public notices for PCSO operations, recruitment, and community events are posted here and in News & Events.',
      'Check News & Events on the homepage for the latest department announcements. Urgent roleplay alerts may also be posted in Discord.',
    ],
    extra: '<p><a class="pcso-button pcso-button-red" href="/news">View all news</a></p>',
  },
  {
    slug: 'patrol-operations',
    title: 'Patrol Operations',
    eyebrow: 'Law Enforcement',
    lead: 'Uniformed patrol covering Pinellas County.',
    body: [
      'Patrol Operations is the front line of PCSO: traffic stops, calls for service, scene security, and first response.',
      'Deputies work assigned districts, stay on radio, and coordinate with dispatch, investigations, and detention when a call grows beyond a routine stop.',
      'Use Active Calls for live CAD activity, Jail Information for current occupancy, and Contact if you need to reach the department.',
    ],
  },
  {
    slug: 'ride-along',
    title: 'Patrol Ride Along Program',
    eyebrow: 'Law Enforcement',
    lead: 'See patrol from the passenger seat before you apply.',
    body: [
      'The Patrol Ride Along Program lets community members and applicants observe a shift with a PCSO deputy.',
      'Ride-alongs are scheduled through staff. After an application is approved, recruits complete training and an R/A as directed by command.',
      'Open a ticket under Contact or speak with patrol staff in Discord to request a ride-along slot.',
    ],
  },
  {
    slug: 'patrol-staff',
    title: 'Patrol Staff',
    eyebrow: 'Divisions',
    lead: 'The deputies and supervisors who staff county patrol.',
    body: [
      'Patrol Staff covers road deputies, field training officers, and patrol supervisors who manage daily assignments and scene command.',
      'They handle most public contacts, traffic enforcement support, and backup for special units when a priority call is holding.',
    ],
  },
  {
    slug: 'public-information',
    title: 'Public Information Office',
    eyebrow: 'Divisions',
    lead: 'News, records, and official department messaging.',
    body: [
      'The Public Information Office handles media, Inside the Star features, public records routing, and official statements from PCSO.',
      'Request records from Contact. News, events, and photo updates are published on this website after staff review.',
    ],
  },
  {
    slug: 'special-response',
    title: 'Special Response Team',
    eyebrow: 'Divisions',
    lead: 'High-risk and tactical support for Pinellas County.',
    body: [
      'The Special Response Team (SRT) supports patrol on high-risk warrants, armed barricades, and other calls that need extra equipment and training.',
      'SRT deploys at command direction and works with patrol, investigations, and dispatch so scenes stay coordinated.',
    ],
  },
  {
    slug: 'traffic-enforcement',
    title: 'Traffic Enforcement Unit',
    eyebrow: 'Divisions',
    lead: 'Focused traffic safety and crash response.',
    body: [
      'The Traffic Enforcement Unit concentrates on speeding, reckless driving, DUI enforcement, and serious crash scenes.',
      'Unit deputies support patrol with specialized traffic investigation and county-wide enforcement details.',
    ],
  },
  {
    slug: 'criminal-investigations',
    title: 'Criminal Investigations Division',
    eyebrow: 'Divisions',
    lead: 'Follow-up investigations beyond the initial patrol report.',
    body: [
      'The Criminal Investigations Division (CID) takes cases that need interviews, evidence follow-up, and longer-term investigation.',
      'Patrol files the first report; CID works with PIO and command when a case is assigned for follow-up.',
    ],
  },
  {
    slug: 'detention',
    title: 'Detention and Court Services',
    eyebrow: 'Divisions',
    lead: 'Jail operations, transports, and court security.',
    body: [
      'Detention and Court Services manages jail occupancy, inmate movement, and courtroom security for Pinellas County.',
      'Current inmates in the booking zone are listed on Jail Information. Transports and court details are coordinated with patrol and dispatch.',
    ],
    extra: '<p><a class="pcso-button pcso-button-red" href="/jail">View jail occupancy</a></p>',
  },
  {
    slug: 'field-training',
    title: 'Field Training Operations',
    eyebrow: 'Divisions',
    lead: 'Training new deputies after they are hired.',
    body: [
      'Field Training Operations (FTO) runs post-hire training and ride-alongs so new deputies meet PCSO standards before solo patrol.',
      'Applicants who are approved must complete training and an R/A. FTO staff document progress and recommend release to patrol.',
    ],
  },
];

export function pcsoSectionHtml(page) {
  const paragraphs = page.body.map((text) => `<p>${text}</p>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="description" content="${page.title} — Pinellas County Sheriff's Office roleplay." />
<meta name="theme-color" content="#6b7078" />
<title>${page.title} | Pinellas County Sheriff's Office</title>
<link rel="icon" type="image/png" href="assets/pcso-sheriff-star.png" />
<link rel="stylesheet" href="styles.css?v=20260917-nav-click" />
<script>document.documentElement.classList.add('js');</script>
</head>
<body class="pcso-home">
<a class="skip-link" href="#main">Skip to content</a>
<div class="pcso-alert"><div class="pcso-wrap pcso-alert-inner"><span><strong>Alert:</strong> This is a roleplay community. Please call 911 for real emergencies.</span><button class="pcso-alert-close" type="button" aria-label="Close warning">×</button></div></div>
<header class="pcso-header"><div class="pcso-wrap pcso-nav">
<a class="pcso-brand" href="/"><img src="assets/pcso-sheriff-star.png" alt="" /><span><b>PINELLAS COUNTY</b><strong>SHERIFF'S OFFICE</strong></span></a>
<button class="pcso-menu" type="button" aria-expanded="false" aria-controls="pcso-navigation">Menu</button>
<nav id="pcso-navigation" class="pcso-links" aria-label="Primary navigation"></nav>
</div></header>
<main id="main" class="pcso-page-main"><div class="pcso-wrap">
<p class="pcso-eyebrow">${page.eyebrow}</p>
<h1>${page.title}</h1>
<p class="pcso-page-lead">${page.lead}</p>
<div class="pcso-page-card pcso-prose">${paragraphs}${page.extra || ''}</div>
</div></main>
<footer class="pcso-footer"><div class="pcso-wrap pcso-footer-grid"><a class="pcso-brand" href="/"><img src="assets/pcso-sheriff-star.png" alt="" /><span><b>PINELLAS COUNTY</b><strong>SHERIFF'S OFFICE</strong></span></a><p>Professionalism · Integrity · Service<br /><small>© 2026 Pinellas County Sheriff's Office Roleplay</small></p><a href="https://discord.gg/839teFCwB" target="_blank" rel="noopener">Discord →</a></div></footer>
<script src="pcso-nav.js?v=20260917-nav-click"></script>
</body>
</html>
`;
}
