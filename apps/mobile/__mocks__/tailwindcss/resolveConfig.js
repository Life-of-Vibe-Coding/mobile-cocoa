// Mock for tailwindcss/resolveConfig (Tailwind CSS v4 doesn't export this)
// This is only used by gluestack-ui in tests
module.exports = function resolveConfig() {
  return {
    theme: {
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
    },
  };
};
