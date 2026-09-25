import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1e293b",
        paper: "#f7f8fa",
        accent: "#176b5b",
      },
    },
  },
  plugins: [],
};

export default config;
