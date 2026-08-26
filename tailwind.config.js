/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#222222', 
          DEFAULT: '#0f1115', 
          dark: '#000000',
        },
        surface: {
          light: '#FFF9F0', // Soft card surface
          DEFAULT: '#F6F2EA', // Soft primary background
          dark: '#FBF8F2', // Soft secondary background
        },
        background: '#F6F2EA', 
        border: {
          DEFAULT: '#E6DED1',
          subtle: '#E6DED1'
        },
        text: {
          DEFAULT: '#222222', // Primary text
          secondary: '#6B665F', // Secondary text
          muted: '#918B82'
        },
        semantic: {
          sage: '#A8C3A0',
          blue: '#AFC8DD',
          peach: '#F3B7A3',
          yellow: '#E9D58A',
          coral: '#E59A87',
          beige: '#DDD0BC',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'], 
      }
    },
  },
  plugins: [],
}
