import { type Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        xs: "475px",
        xl: "1452px",
        "2xl": "1636px",
      },
    },
  },
  plugins: [require("daisyui")],
} satisfies Config;
