// A morning's inbox, invented but not caricatured: the mail you actually have to triage is a
// mix of things that need an answer, things that need filing, and things that need deleting —
// and telling them apart is exactly the judgement the model is trying to learn.

export interface Mail {
  id: number;
  from: string;
  email: string;
  subject: string;
  preview: string;
  body: string[];
  at: string;
  attachments?: Array<{ name: string; size: string }>;
  /** where this one really belongs — used to replay a session, never shown to the model */
  folder: string;
  unread?: boolean;
  thread?: number;
}

export const folders = [
  { id: 'clients', label: 'Clients', icon: '◆', color: '#4a54f2' },
  { id: 'finance', label: 'Finance', icon: '▤', color: '#0ea5e9' },
  { id: 'team', label: 'Team', icon: '◎', color: '#10b981' },
  { id: 'later', label: 'Read later', icon: '▷', color: '#8b5cf6' },
  { id: 'reply', label: 'Reply', icon: '↩', color: '#f59e0b' },
  { id: 'archive', label: 'Archive', icon: '▣', color: '#64748b' },
  { id: 'spam', label: 'Spam', icon: '⚠', color: '#f43f5e' },
  { id: 'trash', label: 'Delete', icon: '✕', color: '#ef4444' },
];

/** Zones that do something to the mail rather than file it somewhere. */
export const actions = new Set(['reply', 'spam', 'trash']);

const raw: Array<[string, string, string, string, string[], string, string, Array<{ name: string; size: string }>?]> = [
  [
    'Camille Roussel',
    'camille@atelier-nord.fr',
    'Re: homepage copy — second pass',
    'Thanks for the turnaround. Two notes on the hero and one on the pricing table…',
    [
      'Thanks for the turnaround on Friday, that was faster than I expected.',
      'Two notes on the hero: the second line still reads as a feature list rather than a promise, and the button label repeats the headline. On the pricing table, could we try the annual toggle on the left? Everyone here reads it before the prices.',
      'No rush before Thursday — the review is at 14:00 and I only need it an hour before.',
    ],
    '08:12',
    'clients',
  ],
  [
    'Stripe',
    'receipts@stripe.com',
    'Your invoice for August is available',
    'Invoice INV-2048 · €149.00 · paid automatically on 14 August',
    [
      'Invoice INV-2048 for €149.00 was paid automatically on 14 August with the card ending 4242.',
      'The invoice and the receipt are attached as PDFs, and both are available in the billing portal for the next seven years.',
    ],
    '07:45',
    'finance',
    [
      { name: 'invoice-2048.pdf', size: '84 KB' },
      { name: 'receipt-2048.pdf', size: '61 KB' },
    ],
  ],
  [
    'Noor Haddad',
    'noor@atelier-nord.fr',
    'Standup moved to 10:15 all week',
    'The room is taken at 10:00 until Friday, so we start fifteen minutes later…',
    [
      'The room is taken at 10:00 until Friday, so we start fifteen minutes later all week.',
      'Same link, same agenda. If you cannot make it, drop your update in the channel before 10:00 and I will read it out.',
    ],
    '07:31',
    'team',
  ],
  [
    'CRYPTO-WEALTH ALERTS',
    'no-reply@qx-invest-signals.biz',
    'FINAL NOTICE: your position expires in 4 hours',
    'Dear investor, our AI signal has identified a 340% opportunity closing TODAY…',
    [
      'Dear investor, our proprietary AI signal has identified a 340% opportunity that closes TODAY at midnight.',
      'Reply with your wallet address to secure your allocation. This message is confidential and intended only for selected members.',
    ],
    '06:58',
    'spam',
  ],
  [
    'Increment',
    'hello@increment.com',
    'On the maintenance of large codebases',
    'This issue: what happens to a codebase after the team that wrote it has left…',
    [
      'This issue is about what happens to a codebase after the team that wrote it has left — five essays, one interview, and a long piece on documentation as an artefact of turnover.',
      'You can read it in the browser or download the PDF. Reply to this address if you would rather receive plain text.',
    ],
    'Yesterday',
    'later',
  ],
  [
    'Camille Roussel',
    'camille@atelier-nord.fr',
    'Invoice for July — small correction',
    'The VAT line is at 20% but our contract says the reverse charge applies…',
    [
      'The VAT line on the July invoice is at 20%, but our contract says the reverse charge applies since we are billed from Belgium.',
      'Could you reissue it? Same amount, same date, just the VAT treatment. Accounting closes on the 20th.',
    ],
    'Yesterday',
    'finance',
  ],
  [
    'GitHub',
    'notifications@github.com',
    '[trieur] Deploy to Pages succeeded',
    'The workflow "Deploy site" completed successfully in 1m 12s…',
    [
      'The workflow "Deploy site" completed successfully in 1 minute 12 seconds on commit d7f81e5.',
      'You are receiving this because you enabled workflow notifications for this repository.',
    ],
    'Yesterday',
    'archive',
  ],
  [
    'Jonas Weber',
    'jonas.weber@nordbahn.de',
    'Speaking slot — 20 minutes on card sorting?',
    'We have a slot on 6 November and your interface work would fit the afternoon…',
    [
      'We have a twenty-minute slot on 6 November and your interface work would fit the afternoon track well.',
      'Travel and accommodation are covered; the talk is recorded but not livestreamed. Could you let me know by the end of next week? I need to close the programme on the 24th.',
    ],
    'Yesterday',
    'reply',
  ],
  [
    'Lina Prakash',
    'lina@studioquiet.co',
    'Re: Re: contract renewal',
    'Approved on our side. One question about the notice period and we can sign…',
    [
      'Approved on our side, with one question: the notice period says thirty days but the schedule refers to a calendar month. Which one governs?',
      'If it is thirty days we can sign today. Otherwise our legal team wants one line changed.',
    ],
    '2 days ago',
    'reply',
  ],
  [
    'Bank of the North',
    'alerts@bankofthenorth.com',
    'Statement ready · account ••4417',
    'Your August statement is ready to download from the secure portal…',
    [
      'Your August statement is ready to download from the secure portal.',
      'We never ask for your credentials by email. If a message claims to, report it.',
    ],
    '2 days ago',
    'finance',
  ],
  [
    'SEO GROWTH TEAM',
    'contact@rank-first-now.top',
    'Your website is losing 87% of its traffic',
    'We ran an audit of your domain and found 214 critical errors…',
    [
      'We ran an audit of your domain and found 214 critical errors that are costing you 87% of your potential traffic.',
      'Our team of experts can fix all of them for a limited-time fee. Reply "AUDIT" for the full report.',
    ],
    '2 days ago',
    'spam',
  ],
  [
    'Noor Haddad',
    'noor@atelier-nord.fr',
    'Retro notes + the two things we said we would stop doing',
    'Notes are in the doc. The two things: no more silent handoffs, no more…',
    [
      'Notes are in the doc. The two things we said we would stop doing: silent handoffs, and reviewing a branch older than three days.',
      'I put the owner next to each action. Mine is the handoff template — it will be ready Wednesday.',
    ],
    '3 days ago',
    'team',
  ],
  [
    'Figma',
    'updates@figma.com',
    'What shipped this month',
    'Variables in dev mode, a faster canvas, and the plugin API changes…',
    [
      'Variables are now available in dev mode, the canvas is faster on large files, and two plugin APIs were deprecated with a six-month window.',
      'The full changelog is on the blog.',
    ],
    '3 days ago',
    'later',
  ],
  [
    'Marc Delaunay',
    'm.delaunay@groupe-verrier.fr',
    'Quote request — 40 workstations',
    'Following our call, could you send a quote for the rollout on 40 workstations…',
    [
      'Following our call on Tuesday, could you send a quote for the rollout on 40 workstations, with and without the training days?',
      'Our purchasing department needs it before the end of the month to book the budget for Q4.',
    ],
    '4 days ago',
    'clients',
  ],
  [
    'Docker',
    'no-reply@docker.com',
    'Your build minutes are at 80%',
    'You have used 80% of the build minutes included in your plan this month…',
    [
      'You have used 80% of the build minutes included in your plan for August. Additional minutes are billed at the usual rate.',
      'You can review the usage breakdown in the billing dashboard.',
    ],
    '4 days ago',
    'archive',
  ],
  [
    'Alina Costa',
    'alina@costaphoto.pt',
    'Photos from the workshop — download link inside',
    'Here are the 240 shots from Thursday, plus the twelve I would print…',
    [
      'Here are the 240 shots from Thursday, plus the twelve I would print if it were my studio.',
      'The link expires in thirty days. Tell me which ones you want retouched and I will do them over the weekend.',
    ],
    '5 days ago',
    'later',
  ],
];

export const mails: Mail[] = raw.map(([from, email, subject, preview, body, at, folder, attachments], i) => ({
  id: i + 1,
  from,
  email,
  subject,
  preview,
  body,
  at,
  folder,
  unread: i < 6,
  ...(attachments ? { attachments } : {}),
}));

/** What the model is allowed to look at: the envelope, never the folder. */
export const meta = (m: Mail) => ({
  from: m.from,
  domain: m.email.split('@')[1] ?? '',
  subject: m.subject,
  text: `${m.subject} ${m.preview}`,
  attachments: m.attachments?.length ?? 0,
});
