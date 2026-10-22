---
source: f8a06617acd391e8d497619fb57f189897406d5e
---
# 7. Componentes

**Lo que verás:** una tarjeta blanca en el centro de la ventana, con un cohete, un título, una frase y un botón morado *Join*.
Al hacer clic en el botón se imprime una línea.

![Una tarjeta con un cohete, el título "Rocket club", una frase y un botón Join](img/07-components.png)

## Una nueva forma de poner cosas en pantalla

En la parte 1 tu programa dibujaba cada fotograma por sí mismo: tenía que decir dónde va cada cosa, en píxeles. Para una app (un formulario, una
lista, unos ajustes) eso es mucho trabajo: el texto debe ajustarse a la línea, las cosas deben alinearse, la ventana puede cambiar de tamaño.

`zinc:ui` hace ese trabajo. Describes lo que contiene la pantalla, una sola vez, como **elementos** dentro de otros elementos, igual que se escribe una
página web. Zinc los coloca, los dibuja y los vuelve a dibujar cuando algo cambia. La descripción usa
**JSX**: etiquetas como las de HTML, dentro del código.

## El código

El proyecto está en [`samples/07-components`](samples/07-components/). El código está en `src/main.tsx`: la `x` de `.tsx`
dice que el archivo contiene JSX. `zinc.json` lo nombra como entrada y tiene una carpeta `assets` para la imagen:

```json
{
  "name": "components",
  "entry": "src/main.tsx",
  "assets": "assets",
  "app": { "id": "com.example.learn.components", "window": { "width": 640, "height": 400 } }
}
```

`src/main.tsx`:

```tsx
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
```

Haz clic en *Join*: la terminal muestra `Welcome aboard!`

## Los elementos

Los elementos de Zinc empiezan con mayúscula, como en React Native:

| Elemento | Qué es |
|---|---|
| `View` | una caja. Contiene otros elementos y los coloca; puede tener fondo, borde y esquinas redondeadas. |
| `Text` | palabras. El texto siempre va dentro de un `Text`. |
| `Image` | una imagen de la carpeta `assets`: `src="rocket.svg"`. |
| `Button` | algo para pulsar: contiene un `Text` (o un icono) y ejecuta `onClick` al pulsarlo. |
| `ScrollView` | una caja cuyo contenido se desplaza cuando es demasiado largo. |
| `Input`, `TextArea` | un campo para escribir una línea, o varias (la lección 12 usa `Input`). |
| `Canvas` | una caja en la que dibujas con `zinc:gfx` (lección 11). |

Dos reglas de escritura, que Zinc comprueba: los elementos empiezan con mayúscula (`<View>`), y el aspecto de un elemento
va en `className` (la palabra más corta es una palabra reservada de JavaScript, así que Zinc la rechaza).

## Cómo se colocan

Un `View` coloca a sus hijos uno debajo del otro, desde arriba. `className` dice cómo:

- `w-full h-full`: tan ancho y tan alto como su padre (aquí toda la ventana).
- `items-center`: los hijos se centran a lo ancho (de izquierda a derecha, en una columna).
- `justify-center`: los hijos se centran a lo largo (de arriba abajo, en una columna).
- `w-[340px]`: exactamente 340 píxeles de ancho. Los corchetes contienen un valor exacto.
- `p-6`: espacio dentro de la caja, por todos los lados. Los números de `p-`, `gap-`, `w-`, `h-` cuentan pasos de 4 píxeles: `p-6` son
  24 píxeles, `gap-3` son 12.
- `gap-3`: 12 píxeles entre los hijos.

Hay más sobre los estilos en la lección 10.

## Línea por línea

- `import { render } from 'zinc:ui/solid';` `render` pone una interfaz en pantalla. Los elementos mismos
  (`View`, `Text`...) no necesitan import.
- `function App(): i32 { return <View ...>...</View>; }` un **componente**: una función que devuelve elementos. `App` es
  toda la interfaz. Su tipo es `i32` (un número entero) porque Zinc nombra cada elemento que crea con un número; nunca
  necesitas mirar ese número.
- `<View className="w-full h-full items-center justify-center">` la caja exterior llena la ventana y centra lo que
  contiene: la tarjeta.
- `<View className="w-[340px] p-6 gap-3 items-center rounded-2xl bg-white">` la tarjeta: 340 píxeles de ancho, 24 píxeles de
  relleno, 12 píxeles entre sus hijos, hijos centrados, esquinas muy redondeadas (`rounded-2xl`), fondo blanco.
  No se indica su altura: mide lo que mide su contenido.
- `<Image src="rocket.svg" className="w-24 h-24" />` la imagen, de 96 por 96 píxeles. `/>` cierra un elemento que no contiene
  nada.
- `<Text className="text-2xl font-bold text-[#1d1b18]">Rocket club</Text>` un título: grande (`text-2xl`), en negrita, casi
  negro. `text-[#1d1b18]` es un color exacto, escrito como en la web.
- `<Text className="text-base text-center text-[#625d55]">...` una frase en el tamaño normal, centrada, gris. Es más larga
  que el ancho de la tarjeta, así que se parte sola en dos líneas.
- `<Button className="h-11 px-6 rounded-full bg-[#5746e0]" onClick={() => console.log('Welcome aboard!')}>` un botón de 44
  píxeles de alto, con 24 píxeles de relleno a izquierda y derecha (`px-6`), extremos redondos, morado. `onClick={...}` le da una
  función que ejecutar cuando se pulsa: las llaves `{ }` ponen código dentro de JSX. La lección 9 trata de los eventos.
- `render(App, 0xf3f1ec, null);` muestra `App` en la ventana. El segundo argumento es el color de fondo de la ventana (un
  número, como en la parte 1). El tercero es una función que se ejecuta en cada fotograma; `null` significa ninguna.

## Prueba esto

- Cambia el título y la frase. Haz la frase más larga y mira cómo se ajusta a la línea.
- Pon la imagen después del botón. El orden de los elementos es el orden en pantalla.
- Añade `flex-row` al `className` de la tarjeta: los hijos se colocan uno al lado del otro.
- Haz la tarjeta más ancha (`w-[480px]`), o quita `w-[340px]` para ver qué hace la tarjeta sin un ancho.
- Añade un segundo botón junto al primero: envuelve los dos en `<View className="flex-row gap-3">...</View>`.
- Crea tu propio componente: `function Title(): i32 { return <Text className="text-3xl">Hi</Text>; }`, y luego escribe
  `<Title />` dentro de `App`.

## Siguiente

[8. Estado](08-state.md): una interfaz que cambia cuando cambia un valor.
