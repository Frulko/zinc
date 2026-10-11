// Images in a box (ZN-262): a 2:1 image (assets/stripes.png, 64x32: red, green, blue and white stripes over a black bottom quarter) in 48x48
// boxes. Row 1, <image> object-fit: the prototype's stretch, contain, cover, none, scale-down, cover from the left, none at the top left, cover
// in a rounded box. Row 2, background images: cover, contain, 8x8 tiles (36, 16 on esp32), repeat-x, space, round, backgroundImage in a style
// object, a gradient over the image. Row 3: tint-*, tintColor with resizeMode in a style, resizeMode="repeat", a tinted rounded cover,
// resizeMode="center" in a wider box.
import { StyleSheet } from 'zinc:ui';
import { render } from 'zinc:ui/solid';

const box = 'w-[48px] h-[48px] bg-zinc-200';
const bg = 'w-[48px] h-[48px] bg-[url(stripes.png)]';
const s = StyleSheet.create({
  card: { width: 48, height: 48, backgroundImage: 'url(stripes.png)', backgroundSize: 'cover', backgroundPosition: 'right', backgroundRepeat: 'no-repeat', borderRadius: 12 },
  tinted: { width: 48, height: 48, backgroundColor: '#e4e4e7', tintColor: '#ff8000', resizeMode: 'contain' },
});
function App(): i32 {
  return <view class="flex flex-col gap-[16px] p-[16px] bg-white">
    <view class="flex flex-row gap-[16px]">
      <image src="stripes.png" class={box} />
      <image src="stripes.png" class={`${box} object-contain`} />
      <image src="stripes.png" class={`${box} object-cover`} />
      <image src="stripes.png" class={`${box} object-none`} />
      <image src="stripes.png" class={`${box} object-scale-down`} />
      <image src="stripes.png" class={`${box} object-cover object-left`} />
      <image src="stripes.png" class={`${box} object-none object-top-left`} />
      <image src="stripes.png" class={`${box} object-cover rounded-2xl`} />
    </view>
    <view class="flex flex-row gap-[16px]">
      <view class={`${bg} bg-cover bg-center`} />
      <view class={`${bg} bg-contain bg-no-repeat bg-center bg-zinc-200`} />
      <view class={`${bg} bg-size-[8px_8px]`} />
      <view class={`${bg} bg-repeat-x bg-size-[16px_8px] bg-center`} />
      <view class={`${bg} bg-repeat-space bg-size-[20px_10px]`} />
      <view class={`${bg} bg-repeat-round bg-size-[20px_10px]`} />
      <view style={s.card} />
      <view class={`${bg} bg-cover bg-linear-to-b from-transparent to-black/60`} />
    </view>
    <view class="flex flex-row gap-[16px]">
      <image src="stripes.png" class={`${box} tint-[#80c0ff]`} />
      <image src="stripes.png" style={s.tinted} />
      <image src="stripes.png" resizeMode="repeat" class={box} />
      <image src="stripes.png" class={`${box} object-cover rounded-xl tint-emerald-300`} />
      <image src="stripes.png" resizeMode="center" class="w-[80px] h-[48px] bg-zinc-200" />
    </view>
  </view>;
}
render(App, 0xffffff, (dt: number) => {});
