// tests/t1/rmpp_sim.sh "keys": a focused field on the reMarkable; the keys AppLoad forwards (ZN_RMPP_SIM_KEYS) must type into it.
import { render } from 'zinc:ui/react';
import { View, TextInput } from 'zinc:react-native';

function App(): i32 {
  return <View style={{ flex: 1, backgroundColor: '#ffffff', padding: 40 }}>
    <TextInput autoFocus={true} onChangeText={(t: string) => console.log(`typed [${t}]`)} onSubmitEditing={() => console.log('submit')}
      style={{ fontSize: 40, borderWidth: 2 }} />
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
