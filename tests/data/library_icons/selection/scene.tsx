import { render } from 'zinc:ui/solid';
import { Checkbox, PasswordField } from 'zinc:ui/kit';
const App = (): i32 => <View><Checkbox label="Included" checked={() => true} onChange={(checked: boolean) => {}} /><Checkbox label="Mixed" checked={() => false} indeterminate={() => true} onChange={(checked: boolean) => {}} /><PasswordField placeholder="Password" /></View>;
render(App, 0xffffff, null);
