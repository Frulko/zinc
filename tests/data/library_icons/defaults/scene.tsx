import { render } from 'zinc:ui/solid';
import { Alert, Spinner } from 'zinc:ui/kit';
function App(): i32 { return <View><Alert title="Saved" /><Spinner /></View>; }
render(App, 0xffffff, null);
