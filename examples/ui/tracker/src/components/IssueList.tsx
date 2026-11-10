import { Accordion, List, ListItem, Badge, EmptyState } from 'zinc:ui/kit';
import { Tracker, IssueGroup } from '../state';
import { Issue, Status } from '../data';
export function IssueList(p: { model: Tracker; compact: boolean; onOpen: () => void }): i32 {
  return <ScrollView className="grow min-h-0">
    <View className="p-4 flex-col gap-4">
      <Show when={p.model.visible().length === 0}>
        <EmptyState title="No matching issues" description="Try another search or clear the filters to see the whole workspace." action="Clear filters" onAction={p.model.clearFilters} icon="search" />
      </Show>
      <Accordion multiple={true} expanded={p.model.expanded} onChange={p.model.setExpanded} items={p.model.groups().map((group: IssueGroup) => ({
        id: group.id, title: group.title + ' · ' + String(group.issues.length),
        content: () => <List className="border-0 p-0 rounded-none">
          {group.issues.map((issue: Issue) => <ListItem title={issue.title} description={issue.id + ' · ' + issue.assignee + ' · ' + issue.label} selected={() => p.model.selectedId() === issue.id} onClick={() => { p.model.select(issue.id); p.onOpen(); }}>
            <Show when={!p.compact}><Badge label={issue.priority} tone={issue.priority === 'Urgent' ? 'warning' : 'neutral'} />
            <Show when={issue.status === Status.Done}><Badge label="Done" tone="success" /></Show></Show>
          </ListItem>)}
        </List>,
      }))} />
    </View>
  </ScrollView>;
}
