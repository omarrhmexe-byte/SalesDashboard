export const METRICS = [
  { key: 'calls', label: 'Calls Made', prefix: '', category: 'activity' },
  { key: 'dms', label: 'Decision Makers Reached', prefix: '', category: 'activity' },
  { key: 'conversations', label: 'Meaningful Conversations', prefix: '', category: 'execution' },
  { key: 'emails', label: 'Emails Sent', prefix: '', category: 'activity' },
  { key: 'linkedin', label: 'LinkedIn Messages Sent', prefix: '', category: 'activity' },
  { key: 'followups', label: 'Follow Ups Completed', prefix: '', category: 'activity' },
  { key: 'meetingsRequested', label: 'Meetings Requested', prefix: '', category: 'execution' },
  { key: 'meetingsBooked', label: 'Meetings Booked', prefix: '', category: 'execution' },
  { key: 'opportunities', label: 'Opportunities Created', prefix: '', category: 'pipeline' },
  { key: 'pipeline', label: 'Pipeline Generated', prefix: '£', category: 'pipeline' },
];

const ACTIVITY_KEYS = ['calls', 'emails', 'linkedin', 'followups'];
const EXECUTION_KEYS = ['conversations', 'meetingsRequested', 'meetingsBooked', 'opportunities'];
const PIPELINE_KEYS = ['opportunities', 'pipeline'];

function avgPct(keys, actuals, targets) {
  const valid = keys.filter(k => targets[k] > 0);
  if (!valid.length) return 0;
  const sum = valid.reduce((acc, k) => acc + Math.min((actuals[k] || 0) / targets[k], 1), 0);
  return Math.round((sum / valid.length) * 100);
}

export function calcScores(actuals, targets) {
  return {
    activity: avgPct(ACTIVITY_KEYS, actuals, targets),
    execution: avgPct(EXECUTION_KEYS, actuals, targets),
    pipeline: avgPct(PIPELINE_KEYS, actuals, targets),
  };
}

export function calcRatios(actuals) {
  const a = actuals;
  return [
    { label: 'DM Reach Rate', value: pct(a.dms, a.calls), desc: 'DMs / Calls' },
    { label: 'Conversation Rate', value: pct(a.conversations, a.dms), desc: 'Conversations / DMs' },
    { label: 'Meeting Request Rate', value: pct(a.meetingsRequested, a.conversations), desc: 'Requested / Conversations' },
    { label: 'Booking Rate', value: pct(a.meetingsBooked, a.meetingsRequested), desc: 'Booked / Requested' },
    { label: 'Opportunity Rate', value: pct(a.opportunities, a.meetingsBooked), desc: 'Opps / Booked' },
  ];
}

function pct(num, den) {
  if (!den || !num) return null;
  return Math.round((num / den) * 100);
}

export function bottleneck(scores) {
  if (scores.activity < 60) return { level: 'red', message: 'Activity volume is the bottleneck. You are not generating enough top-of-funnel. Increase outreach.' };
  if (scores.execution < 60) return { level: 'amber', message: 'Conversion is the bottleneck. Activity is there but it is not converting. Review your messaging and targeting.' };
  if (scores.pipeline < 60) return { level: 'amber', message: 'Qualification is the bottleneck. Meetings are happening but opportunities are not being created. Improve discovery.' };
  return { level: 'green', message: 'On track. All scores above threshold. Maintain consistency.' };
}

export function scoreColor(score) {
  if (score >= 75) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}
