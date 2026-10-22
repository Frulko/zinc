import { render } from 'zinc:ui/solid';

function App(): i32 {
  return <View className="w-full h-full items-center justify-center">
    <View className="w-[340px] p-6 gap-3 items-center rounded-2xl bg-white">
      <Image src="rocket.svg" className="w-24 h-24" />
      <Text className="text-2xl font-bold text-[#1d1b18]">Rocket club</Text>
      <Text className="text-base text-center text-[#625d55]">We build small rockets on Saturdays. Everyone is welcome.</Text>
      <Button className="h-11 px-6 rounded-full bg-[#5746e0]" onClick={() => console.log('Welcome aboard!')}>
        <Text className="text-base font-medium text-white">Join</Text>
      </Button>
    </View>
  </View>;
}

render(App, 0xf3f1ec, null);
