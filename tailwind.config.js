/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        vb: {
          face: '#D4D0C8',
          dark: '#808080',
          highlight: '#FFFFFF',
          shadow: '#404040',
          menu: '#ECE9D8',
          title: '#000080',
          titleEnd: '#1084D0',
          activeTab: '#ECE9D8',
          inactiveTab: '#D4D0C8'
        }
      },
      fontFamily: {
        tahoma: ['Tahoma', 'Verdana', 'sans-serif'],
        hindi: ['Noto Sans Devanagari', 'Mangal', 'sans-serif'],
      }
    },
  },
  // d2: applies a class only in the Desktop 2 look (html.desktop2), e.g. d2:grid-cols-2
  plugins: [function ({ addVariant }) { addVariant('d2', 'html.desktop2 &'); }],
}
