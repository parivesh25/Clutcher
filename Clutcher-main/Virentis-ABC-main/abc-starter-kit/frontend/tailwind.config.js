/** @type {import('tailwindcss').Config} */

// Catppuccin Latte (https://catppuccin.com/palette). Tailwind's colour names are remapped onto it,
// so existing classes like `text-indigo-600` or `bg-slate-900` pick up the theme automatically.
const latte = {
  rosewater: '#dc8a78', flamingo: '#dd7878', pink: '#ea76cb', mauve: '#8839ef', red: '#d20f39',
  maroon: '#e64553', peach: '#fe640b', yellow: '#df8e1d', green: '#40a02b', teal: '#179299',
  sky: '#04a5e5', sapphire: '#209fb5', blue: '#1e66f5', lavender: '#7287fd',
}

function mix(hex, other, amount) {
  const a = hex.match(/\w\w/g).map((h) => parseInt(h, 16))
  const b = other.match(/\w\w/g).map((h) => parseInt(h, 16))
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('')
}

/** A 50–950 scale with the Catppuccin colour at 500, tinted towards Latte base and shaded towards Mocha crust. */
function scale(hex) {
  const light = '#eff1f5'
  const dark = '#11111b'
  return {
    50: mix(hex, light, 0.9), 100: mix(hex, light, 0.8), 200: mix(hex, light, 0.62), 300: mix(hex, light, 0.42),
    400: mix(hex, light, 0.2), 500: hex, 600: mix(hex, dark, 0.12), 700: mix(hex, dark, 0.28),
    800: mix(hex, dark, 0.42), 900: mix(hex, dark, 0.55), 950: mix(hex, dark, 0.68),
  }
}

// Neutrals: Latte base → text, then Mocha surfaces for the dark end (dark panels, buttons).
const neutral = {
  50: '#eff1f5', 100: '#e6e9ef', 200: '#dce0e8', 300: '#ccd0da', 400: '#9ca0b0', 500: '#8c8fa1',
  600: '#6c6f85', 700: '#5c5f77', 800: '#4c4f69', 900: '#313244', 950: '#1e1e2e',
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: neutral, gray: neutral, zinc: neutral,
        indigo: scale(latte.lavender),
        violet: scale(latte.blue), purple: scale(latte.blue),
        blue: scale(latte.blue), sky: scale(latte.sapphire), cyan: scale(latte.sky),
        emerald: scale(latte.green), green: scale(latte.green), teal: scale(latte.teal),
        amber: scale(latte.yellow), yellow: scale(latte.yellow), orange: scale(latte.peach),
        rose: scale(latte.peach), red: scale(latte.red),
        pink: scale(latte.sapphire), fuchsia: scale(latte.sapphire),
        latte,
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
