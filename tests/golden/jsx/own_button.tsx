/** @jsxHelpers ./helpers */
// A component named like a host tag (Button) and imported from the app's components/ folder is the app's component, with its own
// props: only zinc:ui's Button is the host button.
import { dump } from './helpers';
import { Button } from './components/Button';

dump(<View className="flex-col"><Button icon="plus" label="Add" /></View>);
