/** @jsxHelpers ../helpers */
// An app's own Button, in the components/ folder GUIDELINES.md gives a demo (own_button.tsx).
export function Button(props: { icon: string; label: string }): i32 {
  return <View className="flex-row"><Text>{`${props.icon} ${props.label}`}</Text></View>;
}
