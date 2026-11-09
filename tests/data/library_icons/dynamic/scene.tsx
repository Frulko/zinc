import { render } from 'zinc:ui/solid';
import { Alert, Spinner } from 'zinc:ui/kit';
import { Icon } from 'zinc:icons';
const dynamicName = ['he', 'art'].join('');
const App = (): i32 => <View><Alert title="Saved" /><Spinner /><Icon name={dynamicName} /></View>;
render(App, 0xffffff, null);
