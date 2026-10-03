import PDFDocument from 'pdfkit';
import { RIDE_ALONG_WAIVER_SECTIONS, RIDE_ALONG_WAIVER_TITLE } from './pcsoRideAlongWaiver.js';

const formatWhen = (ms) => (ms
  ? new Date(ms).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  : 'Not scheduled');

function formatDob(dob) {
  const [year, month, day] = String(dob || '').split('-');
  return year && month && day ? `${month}/${day}/${year}` : String(dob || 'Unknown');
}

/** Signed ride along waiver as a one-page PDF. */
export function renderRideAlongWaiverPdf(record, { claimerName = '' } = {}) {
  const waiver = record.waiver || {};
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 54,
      info: { Title: `${RIDE_ALONG_WAIVER_TITLE} - ${record.firstName} ${record.lastName}`, Author: "Pinellas County Sheriff's Office Roleplay" },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    doc.rect(0, 0, doc.page.width, 8).fill('#34363b');
    doc.fillColor('#6b7078').font('Helvetica-Bold').fontSize(9)
      .text("PINELLAS COUNTY SHERIFF'S OFFICE ROLEPLAY", left, 40, { characterSpacing: 1.2 });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(17).text(RIDE_ALONG_WAIVER_TITLE, left, 56, { width });
    doc.moveDown(0.4);
    doc.fillColor('#6b7078').font('Helvetica').fontSize(8.5)
      .text(`Request ${record.id} · Waiver version ${waiver.version || 'unknown'}`);

    const details = [
      ['Roleplay name', `${record.firstName} ${record.lastName}`],
      ['Roleplay date of birth', formatDob(record.dob)],
      ['Discord', `${record.requesterUsername || 'Unknown'} (${record.requesterId})`],
      ['Ride along start', formatWhen(record.scheduledAt)],
      ['Meeting spot', record.meetingPlace || 'Not set'],
      ['Supervisor', claimerName || (record.claimedBy ? `Discord ${record.claimedBy}` : 'Not claimed yet')],
    ];
    let y = doc.y + 12;
    const boxTop = y;
    const rowHeight = 17;
    doc.rect(left, boxTop, width, details.length * rowHeight + 12).fill('#f3f4f6');
    y += 7;
    for (const [label, value] of details) {
      doc.fillColor('#4b5563').font('Helvetica-Bold').fontSize(8.5).text(label.toUpperCase(), left + 12, y + 2, { width: 150 });
      doc.fillColor('#111827').font('Helvetica').fontSize(10).text(String(value), left + 165, y, { width: width - 177, lineBreak: false, ellipsis: true });
      y += rowHeight;
    }
    doc.y = boxTop + details.length * rowHeight + 28;

    RIDE_ALONG_WAIVER_SECTIONS.forEach(([heading, body], index) => {
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(`${index + 1}. ${heading}`, left, doc.y, { width });
      doc.moveDown(0.15);
      doc.fillColor('#374151').font('Helvetica').fontSize(9.5).text(body, { width, lineGap: 1.5 });
      doc.moveDown(0.55);
    });

    doc.moveDown(0.6);
    const sigTop = doc.y;
    doc.rect(left, sigTop, width, 78).lineWidth(1).stroke('#9ca3af');
    doc.fillColor('#4b5563').font('Helvetica-Bold').fontSize(8.5).text('SIGNED ELECTRONICALLY ON THE PCSO WEBSITE', left + 14, sigTop + 12);
    doc.fillColor('#111827').font('Times-Italic').fontSize(22).text(waiver.signature || 'Not signed', left + 14, sigTop + 28, { width: width - 28 });
    doc.fillColor('#6b7078').font('Helvetica').fontSize(8.5)
      .text(`Signed ${formatWhen(waiver.signedAt)} by Discord account ${record.requesterUsername || ''} (${record.requesterId}). The rider agreed to every section above.`, left + 14, sigTop + 58, { width: width - 28 });
    doc.end();
  });
}
