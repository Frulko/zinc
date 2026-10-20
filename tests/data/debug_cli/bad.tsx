// a type error inside a JSX element, reported at its own line and column (ZN-371.03)
import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="p-2">
    <Text>
      {missing + 1}
    </Text>
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
