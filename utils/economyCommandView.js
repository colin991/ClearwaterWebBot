import { ECONOMY_TX, formatMoney } from './economyConfig.js';

const TX_LABELS = Object.freeze({
  [ECONOMY_TX.STARTER_GRANT]: 'Starter grant',
  [ECONOMY_TX.TRANSFER]: 'Transfer',
  [ECONOMY_TX.JOB_PAYCHECK]: 'Job payout',
  [ECONOMY_TX.DEPARTMENT_SHIFT_PAY]: 'Department job payout',
  [ECONOMY_TX.ROBBERY_PAYOUT]: 'Robbery payout',
  [ECONOMY_TX.DEATH_FEE]: 'Death fee',
  [ECONOMY_TX.STEAL]: 'Theft',
  [ECONOMY_TX.BANK_DEPOSIT]: 'Deposit',
  [ECONOMY_TX.BANK_WITHDRAWAL]: 'Withdrawal',
  [ECONOMY_TX.DEPARTMENT_TRANSFER]: 'Department transfer',
  [ECONOMY_TX.ADMIN_ADJUSTMENT]: 'Balance adjustment',
  [ECONOMY_TX.CITATION_FINE]: 'Citation fine',
  [ECONOMY_TX.REFUND]: 'Refund',
});

export function transactionLine(tx, viewerId) {
  let label = TX_LABELS[tx.type] || String(tx.type || 'Transaction').replaceAll('_', ' ').toLowerCase();
  if (tx.type === ECONOMY_TX.TRANSFER) {
    label = tx.amount < 0 ? `Sent to <@${tx.toId}>` : `Received from <@${tx.fromId}>`;
  }
  const amount = Number(tx.amount) || 0;
  const when = Math.floor(new Date(tx.createdAt).getTime() / 1000);
  const note = tx.note ? ` — ${tx.note}` : '';
  return `**${label}:** ${formatMoney(amount)}${note} · <t:${when}:R>`;
}

export function walletFields(user) {
  return [
    { name: 'Cash', value: formatMoney(user.cash) },
    { name: 'Bank', value: formatMoney(user.bank) },
    { name: 'Total wealth', value: formatMoney((Number(user.cash) || 0) + (Number(user.bank) || 0)) },
  ];
}
