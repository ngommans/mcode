/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Define your custom color palette here
        // Based on VS Code theme
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
      spacing: {
        // Define your custom spacing scale here
        'xs': '4px',
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
      },
      fontSize: {
        // Define your custom font sizes here
        'sm': '11px',
        'md': '13px',
        'lg': '16px',
        'xl': '18px',
      },
    },
  },
  plugins: [],
}
