/** @jsxHelpers ./helpers */
// A component named like a host tag (Button) and imported from the app's components/ folder is the app's component, with its own
// props: only zinc:ui's Button is the host button. The same for one declared in the file (Input here), as in React.
import { dump } from './helpers';
import { Button } from './components/Button';

function Input(props: { hint: string }) { return <Text>{props.hint}</Text>; }

dump(<View className="flex-col"><Button icon="plus" label="Add" /><Input hint="local" /></View>);
