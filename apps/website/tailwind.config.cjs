/** Shared Tailwind tokens. Preflight is disabled to preserve the established editorial layout. */
module.exports = {
  content: ['./src/**/*.astro', './public/assets/js/**/*.js'],
  prefix: 'tw-',
  corePlugins: {preflight:false},
  theme: {extend: {
    colors: {ink:'#191919', paper:'#ffffff', purple:'#321638', gold:'#f1b744', muted:'#5c5c5c'},
    fontFamily: {sans:['DM Sans','Arial','sans-serif'], editorial:['Georgia','Times New Roman','serif']},
    transitionDuration: {650:'650ms'},
    borderRadius: {card:'1.25rem'},
    screens: {xs:'360px'}
  }},
  plugins: []
};
