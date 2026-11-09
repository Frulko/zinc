// zinc:ui/kit — a small shadcn/ui-style component kit written in Zinc (docs/ui-kit.md).
//
// Components are plain functions returning nodes, so they work in the Solid model and in the React / Inferno model.
// Text comes from props (`label`, `title`, `description`); values that change over time are accessors
// (`value={() => temp()}`, `checked={enabled}`): reactive under Solid, re-read on every render under React.
export { Theme, LIGHT, DARK, theme, setTheme, ACCENTS, useQuietTheme, setThemeAccent, themeAccent, themeColor } from './theme';
export { Spring, SPRING_STATE, SPRING_SMOOTH, SPRING_SNAPPY, SPRING_MORPH, springAt, springValues, springTo } from './motion';
export { heading, leadText, bodyText, smallText, mutedText, captionText, overline } from './typography';
export { Button, ButtonProps } from './button';
export { Form, FormProps } from './form';
export { Input, InputProps, Textarea, TextareaProps, PasswordField, SearchField, NumberField, NumberFieldProps, MoneyField, MoneyFieldProps, ScrubField, TagInput, TagInputProps, OneTimeCode, OneTimeCodeProps, Select, SelectProps, SelectOption, Combobox, MultiSelect, MultiSelectProps, ShortcutRecorder } from './input';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
export { Badge } from './badge';
export { Separator, ResizeHandle } from './separator';
export { Kbd } from './kbd';
export { Keyboard, KeyboardProps } from './keyboard';
export { KeyboardLayout, registerLayout, layoutOf, layoutIds } from './keyboard-layouts';
export { Avatar, initials } from './avatar';
export { Alert } from './alert';
export { Progress, ProgressRing } from './progress';
export { Spinner } from './spinner';
export { Slider, SliderProps, RangeSlider, RangeSliderProps, SliderOptions } from './slider';
export { Switch } from './switch';
export { Tabs, TabsProps } from './tabs';
export { NavigationTabs, TabBar, NavigationItem, NavigationProps, Sidebar, SidebarProps, SidebarGroup, Breadcrumb, BreadcrumbItem, Pagination, Stepper, StepItem, TableOfContents, ContentsItem, Dock, DockItem } from './navigation';
export { nativeControl } from './host';
export { Stat, Metric, StatProps } from './stat';
export { CallStats, CallStatsProps, CallStatsSample } from './callstats';
export { List, ListItem } from './list';
export { Tooltip, TooltipProps, Popover, PopoverProps, DropdownMenu, DropdownMenuProps, MenuItem, Dialog, DialogProps, Sheet, SheetProps, HoverCard, HoverCardProps, ConfirmPopover, ConfirmPopoverProps, GuidedTour, GuidedTourProps, TourStep, ToastOptions, toast, clearToasts, keyLabel } from './overlays';
export { MenuBar, MenuBarProps, ContextMenu, ContextMenuProps, MenuEntry } from './menubar';
export { ZoomView, ZoomViewProps, zoomViewDraws } from './zoomview';
export { ViewerItem, ViewerOptions, openImageViewer, closeImageViewer, imageViewerOpen, imageViewerState } from './imageviewer';

export { IconButton, ButtonGroup, SplitButton, ToggleGroup, SegmentedControl, CopyButton, HoldToConfirm, CommandPalette, ActionOption, CommandItem } from './actions';
export { Toolbar, ToolbarItem, StatusBar, StatusItem, DocumentTabs, DocumentTabsProps, DocumentTab, DockLayout, DockLayoutProps, DockLayoutState, DockNode, DockPanel, saveDockLayout, parseDockLayout, moveDockPanel, setDockPanelOpen } from './app-chrome';
export { Checkbox, CheckboxProps, RadioGroup, RadioCards, RadioGroupProps, ChoiceOption, Chip, ChipProps, Chips, Rating } from './selection';

export { Banner, BannerProps, Meter, MeterProps, Skeleton, SkeletonProps, EmptyState, EmptyStateProps, Timeline, TimelineProps, TimelineItem, AlertProps, BadgeProps, AvatarProps, ProgressProps, ProgressRingProps, SpinnerProps } from './feedback';

export { Calendar, CalendarProps, CalendarOptions, RangeCalendar, RangeCalendarProps, DatePicker, DatePickerProps, DateRangePicker, DateRangePickerProps, TimePicker, TimePickerProps, TimeDial, TimeDialProps, WheelPicker, WheelPickerProps, ColorPicker, ColorPickerProps, EmojiPicker, EmojiPickerProps, EmojiEntry, RulerSlider, RulerSliderProps, HistogramSlider, HistogramSliderProps, Knob, KnobProps, Fader, FaderProps } from './pickers';
export { Table, TableProps, DataGrid, DataGridProps, DataColumn, DataRow, DataSort, DataCursor, dataRows, selectDataRows, TreeTable, TreeTableProps, Tree, TreeProps, TreeItem, flattenTree, PathBar, PathBarProps, PathSegment, Accordion, AccordionProps, AccordionItem, FilterBar, FilterBarProps, DataFilter, FileBrowser, FileBrowserProps, FileEntry, FileLister, readFileEntries, fileMatches, filePathSegments, OpenFileDialog, SaveFileDialog, FileDialogProps } from './data';
