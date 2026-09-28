// PocketJS Hero demo compiled by Zinc (see README.md). Same entry shape as PocketJS apps/hero/main.tsx.
import Hero from "./app.tsx";
import { mount } from "@pocketjs/framework/solid";
import { TICKS_PER_SECOND } from "@pocketjs/framework/clock";

mount(() => <Hero presentationHz={TICKS_PER_SECOND} />);
