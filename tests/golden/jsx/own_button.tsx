/** @jsxHelpers ./helpers */
// A component named like a host tag (Button) and imported from the app's components/ folder is the app's component, with its own
// props: only zinc:ui's Button is the host button. The same for one declared in the file (Input here), as in React.
import { dump } from './helpers';
import { Button } from './components/Button';

function Input(props: { hint: string }) { return <Text>{props.hint}</Text>; }
// inside its own declaration the tag is the host's: a wrapper draws the host TextArea (zinc:ui/nuxt's Input does this)
function TextArea(props: { hint: string }) { return <View className="p-1"><TextArea placeholder={props.hint} /></View>; }

dump(<View className="flex-col"><Button icon="plus" label="Add" /><Input hint="local" /><TextArea hint="wrapped" /></View>);
