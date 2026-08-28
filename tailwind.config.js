/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  safelist: [
    'bg-emerald-50', 'text-emerald-600', 'bg-emerald-500',
    'bg-teal-50', 'text-teal-600', 'bg-teal-500',
    'bg-sky-50', 'text-sky-600', 'bg-sky-500',
    'bg-amber-50', 'text-amber-600', 'bg-amber-500',
    'bg-rose-500',
  ],
  plugins: [],
};
