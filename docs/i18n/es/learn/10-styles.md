---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 10. Estilos

**Lo que verás:** tres tarjetas, *Sunrise*, *Forest* y *Night*, cada una con una muestra de color. Pulsa una: recibe un
borde morado y una sombra, y toda la página toma sus colores (Night la oscurece).

![Tres tarjetas sobre una página oscura, con la tarjeta Night seleccionada](img/10-styles.png)

## El código

El proyecto está en [`samples/10-styles`](samples/10-styles/). `src/main.tsx`:

```tsx
import { createSignal, render } from 'zinc:ui/solid';

const [theme, setTheme] = createSignal<string>('Sunrise');

function pick(name: string): void {
  setTheme(name);
  console.log(`theme: ${name}`);
}

function page(): string {
  if (theme() === 'Night') return 'bg-slate-900';
  if (theme() === 'Forest') return 'bg-emerald-50';
  return 'bg-amber-50';
}

function title(): string {
  return theme() === 'Night' ? 'text-slate-100' : 'text-slate-900';
}

interface CardProps { name: string; swatch: string; words: string }

function Card(props: CardProps): i32 {
  const chosen = (): boolean => theme() === props.name;
  return <Button
    className={`w-[170px] p-4 gap-2 rounded-xl bg-white border-2 hover:bg-slate-50 ${chosen() ? 'border-indigo-600 shadow-lg' : 'border-slate-200 shadow-sm'}`}
    onClick={() => pick(props.name)}>
    <View className={`w-full h-16 rounded-lg ${props.swatch}`} />
    <Text className="text-lg font-bold text-slate-900">{props.name}</Text>
    <Text className="text-sm text-slate-500">{props.words}</Text>
  </Button>;
}

function App(): i32 {
  return <View className={`w-full h-full p-8 gap-6 items-center justify-center ${page()}`}>
    <Text className={`text-3xl font-bold ${title()}`}>Pick a theme</Text>
    <View className="flex-row gap-4">
      <Card name="Sunrise" swatch="bg-amber-400" words="Warm and bright" />
      <Card name="Forest" swatch="bg-emerald-600" words="Calm and green" />
      <Card name="Night" swatch="bg-indigo-900" words="Easy on the eyes" />
    </View>
  </View>;
}

render(App, 0xffffff, null);
```

Pulsa *Night*: la página se oscurece y la terminal muestra `theme: Night`.

## Cómo funciona `className`

`className` contiene una lista de palabras cortas, separadas por espacios, y cada una fija una sola cosa. Son las
palabras de [Tailwind CSS](https://tailwindcss.com), un sistema de estilos para la web: si lo conoces, ya conoces estas.
Cuando `className` es texto normal entre comillas, Zinc lo lee antes de ejecutar el programa y te avisa si una palabra
no existe.

| Para fijar | Escribe | Ejemplos |
|---|---|---|
| ancho, alto | `w-*`, `h-*` | `w-24` (96 px), `w-full` (todo el padre), `h-[200px]` (exactamente 200) |
| espacio interior | `p-*`, `px-*`, `py-*`, `pt-*`... | `p-4` (16 px por todos los lados), `px-6` (24 px a izquierda y derecha) |
| espacio entre hijos | `gap-*` | `gap-4` |
| dirección | `flex-row`, `flex-col` | uno al lado del otro, o uno debajo del otro (lo normal) |
| alineación | `items-*`, `justify-*` | `items-center`, `justify-between` (el primero al principio, el último al final) |
| crecer | `grow` | ocupa el espacio que queda en su padre |
| fondo | `bg-*` | `bg-white`, `bg-amber-400`, `bg-[#5746e0]` |
| texto | `text-*`, `font-*` | `text-sm`, `text-2xl`, `text-slate-500`, `font-bold`, `text-center` |
| esquinas | `rounded-*` | `rounded-lg`, `rounded-xl`, `rounded-full` |
| borde | `border`, `border-2`, `border-*` | `border-2 border-indigo-600` (2 px, morado) |
| sombra | `shadow-*` | `shadow-sm`, `shadow-lg` |
| transparencia | `opacity-*` | `opacity-50` |

Los números cuentan pasos de 4 píxeles (`p-4` son 16 px). Los colores tienen un nombre y un tono de 50 (muy claro) a 950
(muy oscuro): `slate`, `gray`, `red`, `orange`, `amber`, `yellow`, `green`, `emerald`, `teal`, `sky`, `blue`, `indigo`,
`violet`, `purple`, `pink`, `rose` y más. Cualquier valor exacto va entre corchetes: `w-[170px]`, `bg-[#f3f1ec]`.

Una palabra con prefijo se aplica solo en un estado: `hover:bg-slate-50` mientras el puntero está sobre el elemento,
`active:bg-slate-100` mientras se pulsa, `focus:border-blue-500` mientras tiene el foco del teclado.

## Línea por línea

- `const [theme, setTheme] = createSignal<string>('Sunrise');` el tema elegido, una señal que guarda su nombre.
- `function page(): string` da las clases de la página para el tema elegido: un ámbar claro, un verde claro o un gris
  pizarra oscuro. `title()` hace lo mismo con el color del título: texto claro sobre la página oscura.
- `interface CardProps { name: string; swatch: string; words: string }` describe lo que necesita una tarjeta: una
  **interfaz** enumera los nombres y los tipos de los valores que contiene un objeto.
- `function Card(props: CardProps): i32` un componente tuyo. Recibe sus valores en un solo objeto, `props` (de
  *properties*, propiedades): `props.name`, `props.swatch`, `props.words`.
- `const chosen = (): boolean => theme() === props.name;` una función pequeña: ¿es esta la tarjeta elegida?
- `className={`w-[170px] p-4 gap-2 ... ${chosen() ? 'border-indigo-600 shadow-lg' : 'border-slate-200 shadow-sm'}`}`
  las clases de la tarjeta. La primera parte nunca cambia: 170 píxeles de ancho, relleno, esquinas redondeadas, fondo
  blanco, un borde de 2 píxeles, un fondo más claro al pasar el puntero. La parte dentro de `${ }` cambia con la señal:
  la tarjeta elegida recibe un borde morado y una sombra grande, las demás un borde claro y una sombra pequeña. Como el
  texto lee `theme()`, las clases se calculan de nuevo cada vez que cambia el tema.
- `<View className={`w-full h-16 rounded-lg ${props.swatch}`} />` la muestra: todo el ancho, 64 píxeles de alto, con la
  clase de color que se le dio a la tarjeta.
- `<Card name="Sunrise" swatch="bg-amber-400" words="Warm and bright" />` usa el componente. Cada atributo se convierte
  en un campo de `props`. Los componentes que escribes empiezan con mayúscula, como los de Zinc.
- `<View className={`w-full h-full p-8 gap-6 items-center justify-center ${page()}`}>` la página: su fondo sigue al tema.

## Prueba esto

- Añade un cuarto tema, *Ocean*, con `bg-sky-500` como muestra y `bg-sky-50` como página.
- Haz que la tarjeta seleccionada destaque más: `bg-indigo-50` cuando esté elegida.
- Cambia `hover:bg-slate-50` por `hover:bg-amber-100` y pasa el puntero por las tarjetas.
- Pon las tarjetas una debajo de otra: cambia `flex-row` por `flex-col`.
- Redondea las tarjetas del todo con `rounded-3xl`, o hazlas cuadradas con `rounded-none`.
- Escribe un estilo que `className` no pueda decir, como un objeto: `style={{ opacity: 0.8 }}` (la lección 8 usó
  `style={{ width: ... }}`). [zinc:ui a fondo](../ui.md#object-styles-and-stylesheet) enumera las claves de estilo.

## Siguiente

[11. Un dibujo dentro de una interfaz](11-drawing-in-an-interface.md): mezcla la parte 1 y la parte 2.
