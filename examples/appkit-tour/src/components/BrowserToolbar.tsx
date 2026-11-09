// The window's toolbar: New Folder and Move to Trash as SF Symbol items, and the search field (an NSSearchField under the AppKit host).
import { Toolbar, ToolbarItem, SearchField } from 'zinc:appkit';
import { search } from '../state';
import { askNewFolder, confirmTrash } from '../actions';

export function BrowserToolbar(): i32 {
  return <Toolbar>
    <ToolbarItem label="New Folder" symbol="folder.badge.plus" onPress={() => { askNewFolder(); }} />
    <ToolbarItem label="Move to Trash" symbol="trash" onPress={() => { confirmTrash(); }} />
    <ToolbarItem label="Search">
      <SearchField onChange={search} placeholder="Search" className="w-[200px]" accessibilityLabel="Search files" />
    </ToolbarItem>
  </Toolbar>;
}
