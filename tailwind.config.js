/**
 * Tailwind reads every value from src/styles/tokens.css, so there is one source of truth.
 * Components use utilities (bg-panel, text-ink-secondary, text-body); nobody writes a raw hex.
 *
 * fontSize and borderRadius REPLACE Tailwind's stock scales: a stray `text-sm` or
 * `rounded-md` generates no CSS, which keeps every size inside the tokens.
 *
 * Restart `npm run dev` after editing this file: the dev server reads it once at start-up.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    fontSize: {
      title: ['var(--text-title)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
      headline: ['var(--text-headline)', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
      body: ['var(--text-body)', { lineHeight: '1.45', letterSpacing: '-0.005em' }],
      label: ['var(--text-label)', { lineHeight: '1.35', fontWeight: '500' }],
      caption: ['var(--text-caption)', { lineHeight: '1.3', letterSpacing: '0.01em' }],
    },
    borderRadius: {
      none: '0',
      panel: 'var(--radius-panel)',
      glass: 'var(--radius-glass)',
      segment: 'var(--radius-segment)',
      'segment-pill': 'var(--radius-segment-pill)',
      control: 'var(--radius-control)',
      pill: 'var(--radius-pill)',
    },
    extend: {
      screens: {
        // Below this the side panel stops being a column and becomes a sheet over the viewport,
        // so the viewport never loses the screen.
        panel: '880px',
        // A phone (portrait or landscape): narrow or very low. Its twin in JS is PHONE_QUERY
        // (views/layout/usePhone.ts): change both together.
        phone: { raw: '(max-width: 767.98px), (max-height: 519.98px)' },
      },
      colors: {
        canvas: 'var(--canvas)',
        panel: 'var(--panel)',
        'panel-sunken': 'var(--panel-sunken)',
        fill: 'var(--fill)',
        ink: {
          DEFAULT: 'var(--ink)',
          secondary: 'var(--ink-secondary)',
          tertiary: 'var(--ink-tertiary)',
          segment: 'var(--ink-segment)',
          glass: 'var(--ink-on-glass)',
        },
        'on-ink': 'var(--on-ink)',
        separator: 'var(--separator)',
        hover: 'var(--hover)',
        'status-over': 'var(--status-over)',
        'status-within': 'var(--status-within)',
        'status-within-soft': 'var(--status-within-soft)',
        earth: { DEFAULT: 'var(--earth)', soft: 'var(--earth-soft)', dot: 'var(--earth-dot)' },
        'grid-line': 'var(--grid-line)',
        'grid-soft': 'var(--grid-soft)',
        'flow-call': 'var(--flow-call)',
        'flow-engine': 'var(--flow-engine)',
        'flow-data': 'var(--flow-data)',
        'flow-reject': 'var(--flow-reject)',
      },
      // Keys 1-8 are the token scale (4, 8, 12, 16, 24, 32, 48, 64 px), NOT Tailwind's stock scale.
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        7: 'var(--space-7)',
        8: 'var(--space-8)',
        gutter: 'var(--gutter)',
        'panel-pad': 'var(--panel-pad)',
        row: 'var(--row-h)',
        'side-panel': 'var(--side-panel-w)',
        'side-rail': 'var(--side-rail-w)',
        'area-rail': 'var(--area-rail-w)',
        'tool-strip': 'var(--tool-strip-w)',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        glass: 'var(--shadow-glass)',
        control: 'var(--shadow-control)',
        sheet: 'var(--shadow-sheet)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        DEFAULT: 'var(--dur)',
        sheet: 'var(--dur-sheet)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease)',
        sheet: 'var(--ease-sheet)',
      },
    },
  },
  plugins: [],
}
