export type Evidence = {
  id: string;
  category: string;
  title: string;
  date: string;
  source: string;
  detail: string;
  interpretation: string;
  url?: string;
};

export type Profile = {
  id: string;
  name: string;
  initials: string;
  type: 'Researcher' | 'Emerging team' | 'Company';
  field: string;
  affiliation: string;
  score: number;
  trend: string;
  summary: string;
  strongestSignal: string;
  status: string;
  categories: { label: string; value: number }[];
  evidence: Evidence[];
  related: { name: string; relation: string; id?: string }[];
  company?: string;
};

const labels = ['Research quality', 'Builder signal', 'Commercial pull', 'Spinout intent', 'Early traction', 'Track record'];
const categories = (values: number[]) => labels.map((label, index) => ({ label, value: values[index] }));

export const profiles: Profile[] = [
  {
    id: 'maya-chen', name: 'Maya Chen', initials: 'MC', type: 'Researcher',
    field: 'Energy storage', affiliation: 'North Coast Institute · Materials Lab', score: 92, trend: '+24 in 6 months',
    summary: 'A materials researcher moving from a promising battery chemistry toward a deployable system. A new commercialization award and recurring collaborators suggest a team is beginning to form around the work.',
    strongestSignal: 'Commercialization award + a recurring inventor team', status: 'No company identified',
    categories: categories([88, 81, 72, 96, 24, 64]),
    evidence: [
      { id: 'mc-1', category: 'Spinout intent', title: 'A new award moves the work out of the lab.', date: '2026-10-08', source: 'NSF Awards · sample record', detail: 'Fictional fixture: a commercialization award supports pilot-scale testing of a sodium-ion electrode process. Chen and two recurring collaborators are named in the project.', interpretation: 'Deployment-specific funding and a stable three-person team are consistent with a potential commercialization effort.' },
      { id: 'mc-2', category: 'Builder signal', title: 'A working cell, with reproducible test data.', date: '2026-09-17', source: 'Project repository · sample record', detail: 'Fictional fixture: the team released a cell-testing protocol, reference implementation, and dataset accompanying a prototype demonstration.', interpretation: 'A reproducible artifact gives outside researchers something concrete to evaluate and build on.' },
      { id: 'mc-3', category: 'Research quality', title: 'The research has started to travel.', date: '2026-08-22', source: 'Semantic Scholar · sample record', detail: 'Fictional fixture: three independent groups published follow-on work during the last six months, up from one in the previous period.', interpretation: 'Recent independent follow-on work is a momentum signal; it does not establish commercial demand.' },
      { id: 'mc-4', category: 'Spinout intent', title: 'The same names reappear on an IP record.', date: '2026-07-03', source: 'Patent record · sample record', detail: 'Fictional fixture: an electrode manufacturing patent record names Chen, Elias Park, and Noor Haddad. The institute is the assignee.', interpretation: 'The recurring group may represent a durable team. Institute ownership alone does not establish a license or company.' },
    ],
    related: [{ name: 'Elias Park', relation: 'Coinventor · 3 shared papers', id: 'elias-park' }, { name: 'Noor Haddad', relation: 'Coauthor · shared award' }, { name: 'Sodium Systems Group', relation: 'Emerging team', id: 'sodium-systems' }],
  },
  {
    id: 'elias-park', name: 'Elias Park', initials: 'EP', type: 'Researcher', field: 'Advanced manufacturing',
    affiliation: 'North Coast Institute · Process Engineering', score: 86, trend: '+19 in 6 months',
    summary: 'A process engineer connecting battery research with manufacturable systems. Recent work emphasizes throughput and production cost, alongside shared IP with an emerging materials team.',
    strongestSignal: 'Pilot-scale process work + shared battery IP', status: 'No company identified', categories: categories([79, 91, 75, 87, 19, 52]),
    evidence: [
      { id: 'ep-1', category: 'Builder signal', title: 'From a bench result to a repeatable process.', date: '2026-09-28', source: 'arXiv · sample record', detail: 'Fictional fixture: a new paper reports a continuous electrode production prototype, including throughput and cost estimates.', interpretation: 'Manufacturing-specific metrics suggest the research is being evaluated beyond scientific novelty.' },
      { id: 'ep-2', category: 'Spinout intent', title: 'A small team persists across sources.', date: '2026-07-03', source: 'Patent record · sample record', detail: 'Fictional fixture: Park appears with Chen and Haddad on a shared institute-assigned patent record.', interpretation: 'The overlap supports a possible team relationship. No company or licensing agreement has been identified.' },
    ], related: [{ name: 'Maya Chen', relation: 'Coinventor · shared award', id: 'maya-chen' }, { name: 'Sodium Systems Group', relation: 'Emerging team', id: 'sodium-systems' }],
  },
  {
    id: 'sodium-systems', name: 'Sodium Systems Group', initials: 'SS', type: 'Emerging team', field: 'Energy storage', affiliation: 'North Coast Institute · 3 collaborators', score: 89, trend: '+21 in 6 months',
    summary: 'Three collaborators recur across battery papers, a prototype, and a commercialization award. The evidence points to a coherent research-to-deployment effort; a company has not been identified.',
    strongestSignal: 'Three people connected across papers, funding, and IP', status: 'Team inferred · not incorporated', categories: categories([85, 86, 73, 94, 21, 58]),
    evidence: [
      { id: 'ss-1', category: 'Spinout intent', title: 'One team, several independent traces.', date: '2026-10-08', source: 'Cross-source match · sample record', detail: 'Fictional fixture: Chen, Park, and Haddad recur in two papers, one award, and one patent record.', interpretation: 'Recurring collaboration is a team-formation lead. It is not a declaration of startup intent.' },
      { id: 'ss-2', category: 'Commercial pull', title: 'Pilot testing enters the project scope.', date: '2026-09-09', source: 'Project announcement · sample record', detail: 'Fictional fixture: a project update adds external testing of the electrode production process.', interpretation: 'An external testing plan may indicate applied interest. A signed customer contract is not documented.' },
    ], related: [{ name: 'Maya Chen', relation: 'Research lead', id: 'maya-chen' }, { name: 'Elias Park', relation: 'Process engineering', id: 'elias-park' }, { name: 'Noor Haddad', relation: 'Electrochemistry' }],
  },
  {
    id: 'leila-okafor', name: 'Leila Okafor', initials: 'LO', type: 'Researcher', field: 'Robotics', affiliation: 'Alder Research Center · Embodied Systems', score: 83, trend: '+17 in 6 months',
    summary: 'An embodied-systems researcher whose open-source manipulation toolkit is finding users outside the original lab. Adoption is encouraging, while direct commercialization intent remains less certain.', strongestSignal: 'Outside adoption of a working robotics toolkit', status: 'No company identified', categories: categories([87, 95, 66, 63, 12, 47]),
    evidence: [
      { id: 'lo-1', category: 'Builder signal', title: 'Other teams are building with the toolkit.', date: '2026-10-12', source: 'Repository activity · sample record', detail: 'Fictional fixture: five outside teams contributed integrations to an open manipulation toolkit during the last quarter.', interpretation: 'External contributions are stronger adoption evidence than a raw star count.' },
      { id: 'lo-2', category: 'Research quality', title: 'A reproducible benchmark accompanies the paper.', date: '2026-08-14', source: 'arXiv · sample record', detail: 'Fictional fixture: a new preprint includes evaluation code and tests across three robotic platforms.', interpretation: 'Reproducibility supports technical assessment. It does not establish a startup plan.' },
    ], related: [{ name: 'Embodied Systems Lab', relation: 'Research affiliation' }],
  },
  {
    id: 'fieldwork-bio', name: 'Fieldwork Bio', initials: 'FB', type: 'Company', field: 'Biotechnology', affiliation: 'Independent · university spinout', company: 'Fieldwork Bio', score: 79, trend: '+12 in 6 months',
    summary: 'A newly formed team translating biosensor work into field diagnostics. Formation and a pilot announcement confirm commercial activity, with customer outcomes still to be established.', strongestSignal: 'Recent formation + a named pilot program', status: 'Company formed · pre-seed', categories: categories([76, 72, 81, 85, 69, 42]),
    evidence: [
      { id: 'fb-1', category: 'Early traction', title: 'The project has a company around it.', date: '2026-09-30', source: 'Company announcement · sample record', detail: 'Fictional fixture: the team announced formation of a company to develop field diagnostics from its biosensor research.', interpretation: 'Formation confirms an active commercial vehicle; it is a later signal than research-team emergence.' },
      { id: 'fb-2', category: 'Commercial pull', title: 'A field pilot is on the calendar.', date: '2026-10-10', source: 'Pilot announcement · sample record', detail: 'Fictional fixture: a research partner is preparing a limited field evaluation. No paid contract is documented.', interpretation: 'A planned pilot can support commercial interest but should not be treated as revenue.' },
    ], related: [{ name: 'Samira Bell', relation: 'Scientific cofounder' }, { name: 'Jules Rivera', relation: 'Engineering cofounder' }],
  },
  {
    id: 'jonas-weber', name: 'Jonas Weber', initials: 'JW', type: 'Researcher', field: 'Photonics', affiliation: 'Meridian University · Applied Optics', score: 68, trend: '+8 in 6 months',
    summary: 'A photonics researcher with promising recent technical work and limited public evidence of commercialization. More coverage is needed before drawing conclusions about founder intent.', strongestSignal: 'New applied photonics preprint', status: 'Limited source coverage', categories: categories([82, 55, 31, 28, 0, 39]),
    evidence: [{ id: 'jw-1', category: 'Research quality', title: 'An applied direction emerges in recent work.', date: '2026-09-05', source: 'arXiv · sample record', detail: 'Fictional fixture: a recent paper describes an integrated optical sensing prototype with laboratory benchmarks.', interpretation: 'The prototype suggests applied focus. Missing patent and grant evidence reflects coverage limits, not proof of inactivity.' }], related: [{ name: 'Applied Optics Lab', relation: 'Research affiliation' }],
  },
];
