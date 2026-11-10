import { createSignal } from 'zinc:ui/solid';
import { Issue, Status, sampleIssues, statuses, people, priorities } from './data';
export interface IssueGroup { id: string; title: string; issues: Issue[] }
export interface Tracker {
  issues: () => Issue[];
  visible: () => Issue[];
  groups: () => IssueGroup[];
  selected: () => Issue;
  selectedId: () => string;
  select: (id: string) => void;
  query: () => string;
  setQuery: (value: string) => void;
  navigation: () => string;
  navigate: (id: string) => void;
  view: () => string;
  setView: (value: string) => void;
  priority: () => string;
  setPriority: (value: string) => void;
  grouping: () => string;
  setGrouping: (value: string) => void;
  sorting: () => string;
  setSorting: (value: string) => void;
  expanded: () => string[];
  setExpanded: (value: string[]) => void;
  update: (field: string, value: string) => void;
  addComment: (text: string) => void;
  create: (title: string, description: string, status: string, priority: string, assignee: string, team: string) => void;
  notice: () => string;
  clearFilters: () => void;
}
/** Each mounted document owns its fictional data; no network or file is opened. */
export function createTracker(): Tracker {
  const [issues, setIssues] = createSignal<Issue[]>(sampleIssues());
  const [selectedId, setSelectedId] = createSignal('FLD-112');
  const [query, setQuery] = createSignal('');
  const [navigation, setNavigation] = createSignal('all');
  const [view, setView] = createSignal('all');
  const [priority, setPriority] = createSignal('all');
  const [grouping, setGrouping] = createSignal('status');
  const [sorting, setSorting] = createSignal('priority');
  const [expanded, setExpanded] = createSignal<string[]>(['0', '1', '2', '3', '4', 'Unassigned', 'Alex Morgan', 'Jamie Chen', 'Robin Ellis']);
  const [notice, setNotice] = createSignal('Local demo · changes last until this window closes');
  let nextId = 120;
  const selected = (): Issue => issues().find((issue: Issue) => issue.id === selectedId()) ?? issues()[0];
  const visible = (): Issue[] => {
    const needle = query().trim().toLowerCase();
    const result = issues().filter((issue: Issue) => {
      const nav = navigation();
      const matchesNav = nav === 'all' || (nav === 'mine' ? issue.assignee === people[1] : issue.team === nav);
      const matchesView = view() === 'all' || (view() === 'active' ? issue.status === Status.Progress || issue.status === Status.Review : issue.status === Status.Backlog);
      const text = issue.id + ' ' + issue.title + ' ' + issue.description + ' ' + issue.label + ' ' + issue.assignee;
      return matchesNav && matchesView && (priority() === 'all' || issue.priority === priority()) && (needle === '' || text.toLowerCase().includes(needle));
    });
    result.sort((a: Issue, b: Issue) => sorting() === 'title' ? a.title.localeCompare(b.title) : priorities.indexOf(b.priority) - priorities.indexOf(a.priority) || a.id.localeCompare(b.id));
    return result;
  };
  const groups = (): IssueGroup[] => {
    const filtered = visible();
    const keys = grouping() === 'assignee' ? people : ['2', '3', '1', '0', '4'];
    return keys.map((key: string) => ({ id: key, title: grouping() === 'assignee' ? key : statuses[parseInt(key)], issues: filtered.filter((issue: Issue) => grouping() === 'assignee' ? issue.assignee === key : String(issue.status) === key) })).filter((group: IssueGroup) => group.issues.length > 0);
  };
  const select = (id: string): void => { if (issues().some((issue: Issue) => issue.id === id)) setSelectedId(id); };
  const update = (field: string, value: string): void => {
    if (field === 'title' && value.trim() === '') { setNotice('A title is required'); return; }
    setIssues(issues().map((issue: Issue) => {
      if (issue.id !== selectedId()) return issue;
      const next: Issue = { ...issue };
      if (field === 'title') next.title = value;
      else if (field === 'description') next.description = value;
      else if (field === 'status') next.status = parseInt(value) as Status;
      else if (field === 'priority') next.priority = value;
      else if (field === 'assignee') next.assignee = value;
      else if (field === 'team') next.team = value;
      return next;
    }));
    setNotice(selectedId() + ' saved');
  };
  const clearFilters = (): void => { setQuery(''); setPriority('all'); setView('all'); setNavigation('all'); };
  return {
    issues, visible, groups, selected, selectedId, select, query, setQuery, navigation,
    navigate: (id: string): void => { setNavigation(id); }, view, setView, priority, setPriority, grouping, setGrouping, sorting, setSorting, expanded, setExpanded, update, notice, clearFilters,
    addComment: (text: string): void => {
      if (text.trim() === '') return;
      setIssues(issues().map((issue: Issue) => issue.id === selectedId() ? { ...issue, comments: issue.comments.concat([{ author: people[1], text: text.trim() }]) } : issue));
      setNotice('Comment added to ' + selectedId());
    },
    create: (title: string, description: string, status: string, level: string, assignee: string, team: string): void => {
      if (title.trim() === '') return;
      const id = 'FLD-' + String(nextId++);
      setIssues(issues().concat([{ id, title: title.trim(), description, status: parseInt(status) as Status, priority: level, assignee, team, label: 'New', comments: [] }]));
      clearFilters(); select(id); setNotice(id + ' created');
    },
  };
}
