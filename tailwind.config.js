/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#e1c37a',
          DEFAULT: '#b59247',
          dark: '#a6823b',
        },
        surface: {
          light: '#ffffff',
          DEFAULT: '#f7f6f2',
          dark: '#0f141a',
        },
        background: '#f7f6f2',
      },
    },
  },
  plugins: [],
}
