export enum Status { Backlog, Todo, Progress, Review, Done }
export interface Comment { author: string; text: string }
export interface Issue {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: string;
  assignee: string;
  team: string;
  label: string;
  comments: Comment[];
}
export const statuses = ['Backlog', 'Todo', 'In progress', 'In review', 'Done'];
export const people = ['Unassigned', 'Alex Morgan', 'Jamie Chen', 'Robin Ellis'];
export const priorities = ['Low', 'Medium', 'High', 'Urgent'];
export const teams = ['Product', 'Design', 'Platform'];
export function sampleIssues(): Issue[] {
  return [
    { id: 'FLD-112', title: 'Keep field notes available offline', description: 'A survey team should be able to open its most recent notes without a connection. Show clearly when the device is using a saved copy.', status: Status.Progress, priority: 'High', assignee: 'Alex Morgan', team: 'Product', label: 'Offline', comments: [{ author: 'Jamie Chen', text: 'The saved-copy label is ready for review.' }] },
    { id: 'FLD-108', title: 'Make the map legend easier to scan', description: 'Group the trail symbols by type and keep every label readable on a small screen.', status: Status.Progress, priority: 'Medium', assignee: 'Jamie Chen', team: 'Design', label: 'Maps', comments: [] },
    { id: 'FLD-105', title: 'Retry interrupted photo uploads', description: 'Resume an interrupted upload from the pending queue. A failed upload must keep the original photograph.', status: Status.Progress, priority: 'Urgent', assignee: 'Robin Ellis', team: 'Platform', label: 'Upload', comments: [] },
    { id: 'FLD-110', title: 'Review the first-run permission copy', description: 'Explain why location is useful before asking for permission. The survey remains usable when access is declined.', status: Status.Review, priority: 'High', assignee: 'Alex Morgan', team: 'Product', label: 'Onboarding', comments: [] },
    { id: 'FLD-103', title: 'Add keyboard shortcuts to the notebook', description: 'Make the common notebook actions reachable without a pointer. Include the shortcuts in the help menu.', status: Status.Review, priority: 'Medium', assignee: 'Jamie Chen', team: 'Design', label: 'Accessibility', comments: [] },
    { id: 'FLD-116', title: 'Show survey progress on the home screen', description: 'Summarise completed locations and the remaining visits for the current survey.', status: Status.Todo, priority: 'Medium', assignee: 'Alex Morgan', team: 'Product', label: 'Surveys', comments: [] },
    { id: 'FLD-114', title: 'Export a clean printable route sheet', description: 'A route sheet needs the stops, access notes and emergency contact details in a readable order.', status: Status.Todo, priority: 'Low', assignee: 'Jamie Chen', team: 'Design', label: 'Export', comments: [] },
    { id: 'FLD-109', title: 'Reduce the size of cached map tiles', description: 'Discard expired tiles before removing the recent route. Keep the storage limit visible.', status: Status.Todo, priority: 'High', assignee: 'Robin Ellis', team: 'Platform', label: 'Storage', comments: [] },
    { id: 'FLD-118', title: 'Explore audio annotations for site visits', description: 'Investigate a short recording attached to a location, with a text alternative for accessibility.', status: Status.Backlog, priority: 'Low', assignee: 'Unassigned', team: 'Product', label: 'Research', comments: [] },
    { id: 'FLD-119', title: 'Clarify the empty survey state', description: 'Help a new team create its first survey with one clear action.', status: Status.Backlog, priority: 'Low', assignee: 'Jamie Chen', team: 'Design', label: 'Onboarding', comments: [] },
    { id: 'FLD-101', title: 'Restore the last selected workspace', description: 'Return to the workspace used on the previous visit.', status: Status.Done, priority: 'Medium', assignee: 'Robin Ellis', team: 'Platform', label: 'Workspace', comments: [] },
    { id: 'FLD-100', title: 'Publish the field guide', description: 'A concise guide to collecting useful, consistent survey notes.', status: Status.Done, priority: 'Low', assignee: 'Alex Morgan', team: 'Product', label: 'Docs', comments: [] },
  ];
}
