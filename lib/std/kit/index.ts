// zinc:ui/kit — a small shadcn/ui-style component kit written in Zinc (docs/ui-kit.md).
//
// Components are plain functions returning nodes, so they work in the Solid model and in the React / Inferno model.
// Text comes from props (`label`, `title`, `description`); values that change over time are accessors
// (`value={() => temp()}`, `checked={enabled}`): reactive under Solid, re-read on every render under React.
export { Theme, LIGHT, DARK, theme, setTheme } from './theme';
export { heading, leadText, bodyText, smallText, mutedText, captionText, overline } from './typography';
export { Button, ButtonProps } from './button';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
export { Badge } from './badge';
export { Separator } from './separator';
export { Kbd } from './kbd';
export { Keyboard, KeyboardProps } from './keyboard';
export { KeyboardLayout, registerLayout, layoutOf, layoutIds } from './keyboard-layouts';
export { Avatar, initials } from './avatar';
export { Alert } from './alert';
export { Progress } from './progress';
export { Slider } from './slider';
export { Switch } from './switch';
export { Tabs } from './tabs';
export { Stat } from './stat';
export { List, ListItem } from './list';
export { Tooltip, TooltipProps, Popover, PopoverProps, DropdownMenu, DropdownMenuProps, MenuItem, Dialog, DialogProps, toast, keyLabel } from './overlays';
