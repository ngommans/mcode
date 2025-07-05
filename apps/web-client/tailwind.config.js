/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui-components/src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui-components/src/styles.css",
  ],
  theme: {
    extend: {
      colors: {
        vscodeBg: '#0f0f0f',
        vscodeSurface: '#1e1e1e',
        vscodeBorder: '#333',
        vscodeTextPrimary: '#ffffff',
        vscodeTextSecondary: '#cccccc',
        vscodeTextTertiary: '#aaaaaa',
        vscodeAccent: '#007acc',
        vscodeAccentDark: '#005a9e',
        vscodeSuccess: '#51cf66',
        vscodeError: '#ff6b6b',
        vscodeWarning: '#ffd43b',
        vscodeInfoBg: '#2d2d2d',
        vscodeInfoBorder: '#444',
        vscodeErrorBg: '#2d1f1f',
        vscodeErrorBorder: '#cd3131',
      },
    },
  },
  plugins: [],
}
