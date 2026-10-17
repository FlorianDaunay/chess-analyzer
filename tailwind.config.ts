import type { Config } from "tailwindcss";
import { tailwindThemeExtension } from "./src/themes/tailwind";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // cast: Tailwind's types reject function colours
    extend: tailwindThemeExtension() as unknown as NonNullable<Config["theme"]>,
  },
  plugins: [],
} satisfies Config;
