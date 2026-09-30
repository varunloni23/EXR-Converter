/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#0B0D10',
          card: '#12161B',
          cardHover: '#161C23',
          border: '#252B33',
          borderLight: '#323A45',
          accent: '#7C5CFF',
          accentHover: '#6A46FF',
          accentMuted: 'rgba(124, 92, 255, 0.15)',
          success: '#35C98A',
          successMuted: 'rgba(53, 201, 138, 0.15)',
          warning: '#F5B942',
          warningMuted: 'rgba(245, 185, 66, 0.15)',
          error: '#FF5C5C',
          errorMuted: 'rgba(255, 92, 92, 0.15)',
          text: '#F5F7FA',
          textSecondary: '#8D96A3',
          textMuted: '#5E6673',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        'glow-accent': '0 0 24px -4px rgba(124, 92, 255, 0.35)',
        'glow-success': '0 0 24px -4px rgba(53, 201, 138, 0.35)',
        'glow-error': '0 0 24px -4px rgba(255, 92, 92, 0.35)',
      },
    },
  },
  plugins: [],
};
