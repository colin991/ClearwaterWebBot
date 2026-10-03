export const RIDE_ALONG_WAIVER_VERSION = '2026-10-03';
export const RIDE_ALONG_WAIVER_TITLE = 'Patrol Ride Along Release of Liability and Agreement';

export const RIDE_ALONG_WAIVER_SECTIONS = Object.freeze([
  ['Voluntary participation', 'I am choosing to ride along with a Pinellas County Sheriff’s Office (PCSO) supervisor in the ER:LC roleplay server. I understand this is a roleplay community and nothing in the ride along happens in real life.'],
  ['Assumption of risk', 'I understand that during the ride along my character may be exposed to in-game risks, including crashes, gunfire, injury, death, arrest scenes, and damage to vehicles or property. I accept those risks for my character and will not hold PCSO, its supervisors, or its deputies responsible for them.'],
  ['Following instructions', 'I will follow every instruction from the supervisor I am riding with. I will stay in or near the patrol vehicle unless told otherwise, and I will not interfere with calls, suspects, evidence, or other deputies.'],
  ['Safety rules', 'I will wear a ballistic vest when told to. I understand the supervisor will not take high-priority calls, transport suspects, exceed speed limits, or get into pursuits while I am riding along.'],
  ['Conduct', 'I will follow the server rules and PCSO policy, stay in character, and treat everyone with respect. I will not share sensitive PCSO radio traffic or information outside the ride along.'],
  ['Ending the ride along', 'The supervisor or PCSO command staff may end the ride along at any time and for any reason. A no-show, misconduct, or rule break may be logged and can affect future ride along requests.'],
  ['Records', 'I agree that PCSO may keep this signed agreement, my Discord account, my roleplay name, and the details of my ride along in its records.'],
]);

export function rideAlongWaiverPlainText() {
  return RIDE_ALONG_WAIVER_SECTIONS.map(([heading, body], index) => `${index + 1}. ${heading}. ${body}`).join('\n\n');
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function rideAlongWaiverHtml() {
  return `<h4>${escapeHtml(RIDE_ALONG_WAIVER_TITLE)}</h4><ol>${RIDE_ALONG_WAIVER_SECTIONS
    .map(([heading, body]) => `<li><strong>${escapeHtml(heading)}.</strong> ${escapeHtml(body)}</li>`)
    .join('')}</ol>`;
}

const normalizeName = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The typed signature must be the roleplay name on the request. */
export function validateRideAlongWaiver(fields = {}, { firstName = '', lastName = '' } = {}) {
  if (fields.waiverAgree !== true && fields.waiverAgree !== 'on' && fields.waiverAgree !== 'true') {
    throw new Error('Read and agree to the liability waiver.');
  }
  const signature = String(fields.waiverSignature ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
  if (!signature) throw new Error('Type your roleplay name to sign the liability waiver.');
  const expected = normalizeName(`${firstName} ${lastName}`);
  if (expected && normalizeName(signature) !== expected) {
    throw new Error(`Sign the waiver with your roleplay name exactly: ${`${firstName} ${lastName}`.trim()}.`);
  }
  return { signature, version: RIDE_ALONG_WAIVER_VERSION };
}
